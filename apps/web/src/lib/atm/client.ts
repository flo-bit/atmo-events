import { Client, CredentialManager, type AtpSessionData } from '@atcute/client';
import type { Did, Nsid } from '@atcute/lexicons';
import { createAtmAppClient } from './sdk';
import { getAtmConfig } from './config';

/**
 * Authenticated ATM app client. `atm` is the vendored App Node SDK client
 * (every call mints a fresh single-use service-auth JWT through the app
 * account's PDS); `flush()` persists the possibly-refreshed PDS session back
 * to KV — call it once at the end of a request so rotated tokens survive.
 *
 * Mirrors the reply bot's app-password session ($lib/bot/session.ts): resume
 * from KV, fall back to a fresh login, persist immediately.
 */
export type AtmHandle = {
	atm: ReturnType<typeof createAtmAppClient>;
	did: Did;
	environment: 'test' | 'live';
	flush: () => Promise<void>;
};

/** KV key for the ATM app account's persisted credential session. */
const sessionKey = (identifier: string) => `atm:session:${identifier}`;

/**
 * Log the ATM app account in (or resume a persisted session) and return an
 * ATM client bound to it. Returns `null` when the integration is not
 * configured so callers can no-op cleanly.
 */
export async function getAtmHandle(env: App.Platform['env']): Promise<AtmHandle | null> {
	const config = getAtmConfig(env);
	if (!config) return null;

	const kv = env.OAUTH_SESSIONS;
	const key = sessionKey(config.identifier);

	const manager = new CredentialManager({ service: config.pdsUrl });

	const saved = await loadSession(kv, key);
	let session: AtpSessionData | undefined;
	if (saved) {
		try {
			session = await manager.resume(saved);
		} catch (e) {
			console.warn('[atm] resume failed, logging in fresh:', e);
		}
	}
	if (!session) {
		session = await manager.login({
			identifier: config.identifier,
			password: config.password
		});
	}

	// Sanity pin: a session for the wrong account would fail every ATM call
	// with AppNotRegistered anyway — fail fast with a clearer signal instead.
	if (config.appDid && session.did !== config.appDid) {
		console.error(
			`[atm] ATM_APP_IDENTIFIER resolved to ${session.did}, expected ATM_APP_DID=${config.appDid} — ATM disabled`
		);
		return null;
	}

	// Persist immediately so a fresh login is reusable even if the run later throws.
	await saveSession(kv, key, manager.session);

	const appClient = new Client({ handler: manager });

	const atm = createAtmAppClient({
		brokerUrl: config.brokerUrl,
		appViewUrl: config.appViewUrl,
		serviceAudience: config.serviceAudience,
		// Called by the SDK per ATM XRPC request. The app's PDS signs the token
		// (com.atproto.server.getServiceAuth) so the repo signing key never
		// leaves the PDS; ATM replay-protects `jti`, so tokens are single-use
		// and must be minted fresh per call — never cached.
		getServiceAuthToken: async ({ lxm, aud }) => {
			const res = await appClient.get('com.atproto.server.getServiceAuth', {
				params: { aud: aud as Did, lxm: lxm as Nsid }
			});
			if (!res.ok) throw new Error('could not mint ATM service-auth token');
			return res.data.token;
		}
	});

	return {
		atm,
		did: session.did,
		environment: config.environment,
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
