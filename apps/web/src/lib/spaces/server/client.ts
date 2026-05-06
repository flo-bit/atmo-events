import type { Client } from '@atcute/client';
import { Client as AtcuteClient } from '@atcute/client';
import { createHandler } from '@atmo-dev/contrail/server';
import { contrail, ensureInit } from '$lib/contrail/index';
import { SERVICE_DID } from '../config';

// Register lexicon ambient types (atmo-events/generated)
import '../../../lexicon-types/index.js';

const handle = createHandler(contrail);

/** Cache-key per (did→lxm). Keyed per-request client to avoid bleed across users. */
function makeJwtCache() {
	return new Map<string, { token: string; expiresAt: number }>();
}

async function mintServiceJwt(
	oauthClient: Client,
	aud: string,
	lxm: string
): Promise<string> {
	const response = await oauthClient.get('com.atproto.server.getServiceAuth', {
		params: {
			aud: aud as `did:${string}:${string}`,
			lxm: lxm as `${string}.${string}.${string}`,
			exp: Math.floor(Date.now() / 1000) + 300
		}
	});
	if (!response.ok) {
		throw new Error(
			`getServiceAuth failed: ${response.status} ${JSON.stringify(response.data)}`
		);
	}
	return response.data.token;
}

/** Build a typed @atcute/client that routes rsvp.atmo.* calls through
 *  contrail's handler in-process, attaching a real service-auth JWT per request.
 *  Each JWT is cached for ~4 minutes to avoid hammering the user's PDS. */
export function getSpacesClient(oauthClient: Client, db: D1Database): Client {
	if (!SERVICE_DID) {
		throw new Error('Spaces not configured (no SERVICE_DID). Run `pnpm tunnel` in dev.');
	}
	const aud = SERVICE_DID;
	const jwtCache = makeJwtCache();

	async function jwtFor(lxm: string): Promise<string> {
		const cached = jwtCache.get(lxm);
		if (cached && cached.expiresAt > Date.now() + 10_000) return cached.token;
		const token = await mintServiceJwt(oauthClient, aud, lxm);
		jwtCache.set(lxm, { token, expiresAt: Date.now() + 250_000 });
		return token;
	}

	return new AtcuteClient({
		handler: async (pathname, init) => {
			await ensureInit(db);
			const url = new URL(pathname, 'http://localhost');
			const nsid = url.pathname.replace(/^\/xrpc\//, '');
			const token = await jwtFor(nsid);
			const headers = new Headers(init?.headers as HeadersInit);
			headers.set('Authorization', `Bearer ${token}`);
			return handle(new Request(url, { ...init, headers }), db) as Promise<Response>;
		}
	});
}
