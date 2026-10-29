import { env } from 'cloudflare:workers';
import { Contrail } from '@atmo-dev/contrail';
import { createHandler } from '@atmo-dev/contrail/server';
import { Client } from '@atcute/client';
import { config } from '../contrail.config';
import { moderatorDids } from '../moderation/config';

// Bind lazily: runtime bindings are unavailable during build/prerender. Cache by
// database rather than a global boolean, and share concurrent initialization.
const instances = new WeakMap<
	D1Database,
	{
		contrail: Contrail;
		handle: ReturnType<typeof createHandler>;
		ready?: Promise<void>;
	}
>();

function instance(db: D1Database) {
	let state = instances.get(db);
	if (!state) {
		const contrail = new Contrail({
			...config,
			moderation: { moderators: moderatorDids(env.MODERATOR_DIDS), reports: false }
		});
		state = { contrail, handle: createHandler(contrail) };
		instances.set(db, state);
	}
	return state;
}

export async function ensureInit(db: D1Database): Promise<Contrail> {
	const state = instance(db);
	state.ready ??= state.contrail.init(db, { deferModerationPolicyJob: true }).catch((error) => {
		state.ready = undefined;
		throw error;
	});
	await state.ready;
	return state.contrail;
}

/** Anonymous public queries routed in-process, with no HTTP roundtrip. Private
 * report operations use separate session-authenticated remote functions. */
export function getServerClient(db: D1Database) {
	return new Client({
		handler: async (pathname, init) => {
			await ensureInit(db);
			return instance(db).handle(new Request(new URL(pathname, 'http://localhost'), init), db);
		}
	});
}

export async function handleContrailRequest(request: Request, db: D1Database): Promise<Response> {
	await ensureInit(db);
	return instance(db).handle(request, db);
}
