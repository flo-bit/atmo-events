import { Client } from '@atcute/client';
import { PasswordSession, type PasswordSessionData } from '@atcute/password-session';
import type { Did } from '@atcute/lexicons';
import { DEFAULT_BOT_PDS } from './config';

/** Authenticated reply bot; flush rotated credentials after each run. */
export type BotHandle = {
	client: Client;
	did: Did;
	flush: () => Promise<void>;
};

const sessionKey = (identifier: string) => `bot:session:${identifier}`;

/** Reuse the existing bot session without changing its KV key or account. */
export async function getBotHandle(env: Cloudflare.Env): Promise<BotHandle | null> {
	const identifier = env.BOT_IDENTIFIER;
	const password = env.BOT_APP_PASSWORD;
	if (!identifier || !password) {
		console.warn('[bot] BOT_IDENTIFIER / BOT_APP_PASSWORD not set — skipping bot run');
		return null;
	}

	const kv = env.OAUTH_SESSIONS;
	const key = sessionKey(identifier);
	const service = env.BOT_PDS_URL || DEFAULT_BOT_PDS;
	const saved = await loadSession(kv, key);
	const manager = await PasswordSession.login(
		{ service, identifier, password },
		// CredentialManager sessions predating this migration may lack `service`.
		{ session: saved ? { ...saved, service: saved.service || service } : undefined }
	);

	// Resuming a session (or refreshing its profile metadata) is not a credential
	// change. In particular, a read-only public click must not write KV twice.
	let persisted = credentials(saved);
	const flush = async () => {
		const snapshot = { ...manager.session };
		const next = credentials(snapshot);
		if (next === persisted) return;
		await saveSession(kv, key, snapshot);
		persisted = next;
	};
	await flush();
	return {
		client: new Client({ handler: manager }),
		did: manager.did,
		flush
	};
}

async function loadSession(kv: KVNamespace, key: string): Promise<PasswordSessionData | undefined> {
	const raw = await kv.get(key, 'text');
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as PasswordSessionData;
	} catch {
		return undefined;
	}
}

function credentials(session: PasswordSessionData | undefined): string | undefined {
	if (!session) return undefined;
	return JSON.stringify([
		session.did,
		session.service,
		session.pdsUri,
		session.accessJwt,
		session.refreshJwt
	]);
}

type Writer = { pending: Promise<void>; lastWriteAt: number; credentials?: string };
const writers = new WeakMap<KVNamespace, Map<string, Writer>>();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function saveSession(
	kv: KVNamespace,
	key: string,
	session: PasswordSessionData
): Promise<void> {
	let namespace = writers.get(kv);
	if (!namespace) writers.set(kv, (namespace = new Map()));
	let writer = namespace.get(key);
	if (!writer) {
		writer = { pending: Promise.resolve(), lastWriteAt: -Infinity };
		namespace.set(key, writer);
	}
	const state = writer;
	const next = credentials(session);
	// Serialize/deduplicate writes within this isolate. Other isolates can still
	// hit the same key, so retry KV's per-key 429 with bounded, jittered backoff.
	const pending = state.pending.then(async () => {
		if (state.credentials === next) return;
		const wait = state.lastWriteAt + 1_000 - Date.now();
		if (wait > 0) await delay(wait);
		for (let attempt = 0; ; attempt++) {
			try {
				await kv.put(key, JSON.stringify(session));
				state.lastWriteAt = Date.now();
				state.credentials = next;
				return;
			} catch (cause) {
				if (
					attempt >= 3 ||
					!(cause instanceof Error) ||
					!/\b429\b|too many requests|rate.?limit/i.test(cause.message)
				)
					throw cause;
				await delay(1_000 * 2 ** attempt + Math.floor(Math.random() * 250));
			}
		}
	});
	state.pending = pending.catch(() => {});
	await pending;
}
