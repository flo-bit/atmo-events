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

	await saveSession(kv, key, manager.session);
	return {
		client: new Client({ handler: manager }),
		did: manager.did,
		flush: () => saveSession(kv, key, manager.session)
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

async function saveSession(
	kv: KVNamespace,
	key: string,
	session: PasswordSessionData
): Promise<void> {
	await kv.put(key, JSON.stringify(session));
}
