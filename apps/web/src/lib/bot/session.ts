import { Client, CredentialManager, type AtpSessionData } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import { DEFAULT_BOT_PDS } from './config';

/**
 * Authenticated handle for the bot account. `client` makes API calls;
 * `flush()` persists the (possibly refreshed) session back to KV — call it once
 * at the end of a run so rotated tokens survive to the next tick.
 */
export type BotHandle = {
	client: Client;
	did: Did;
	flush: () => Promise<void>;
};

/** KV key for the bot's persisted credential session (namespaced away from DIDs). */
const sessionKey = (identifier: string) => `bot:session:${identifier}`;

/**
 * Log the bot in (or resume a persisted session) using an app password.
 *
 * Reuses the OAUTH_SESSIONS KV namespace for storage. Returns `null` when the
 * bot isn't configured (no identifier/password) so the cron can no-op cleanly
 * in dev or before the secret is set.
 */
export async function getBotHandle(env: App.Platform['env']): Promise<BotHandle | null> {
	const identifier = env.BOT_IDENTIFIER;
	const password = env.BOT_APP_PASSWORD;
	if (!identifier || !password) {
		console.warn('[bot] BOT_IDENTIFIER / BOT_APP_PASSWORD not set — skipping bot run');
		return null;
	}

	const kv = env.OAUTH_SESSIONS;
	const key = sessionKey(identifier);

	const manager = new CredentialManager({
		service: env.BOT_PDS_URL || DEFAULT_BOT_PDS
	});

	const saved = await loadSession(kv, key);
	let session: AtpSessionData | undefined;
	if (saved) {
		try {
			session = await manager.resume(saved);
		} catch (e) {
			console.warn('[bot] resume failed, logging in fresh:', e);
		}
	}
	if (!session) {
		session = await manager.login({ identifier, password });
	}

	// Persist immediately so a fresh login is reusable even if the run later throws.
	await saveSession(kv, key, manager.session);

	return {
		client: new Client({ handler: manager }),
		did: session.did,
		flush: () => saveSession(kv, key, manager.session)
	};
}

async function loadSession(kv: KVNamespace, key: string): Promise<AtpSessionData | undefined> {
	const raw = await kv.get(key, 'text');
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as AtpSessionData;
	} catch {
		return undefined;
	}
}

async function saveSession(
	kv: KVNamespace,
	key: string,
	session: AtpSessionData | undefined
): Promise<void> {
	if (!session) return;
	await kv.put(key, JSON.stringify(session));
}
