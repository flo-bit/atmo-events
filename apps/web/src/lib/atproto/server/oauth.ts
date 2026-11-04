import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { PUBLIC_SIGNUP_PDS_URL } from '$app/env/public';
import {
	createAtprotoAuth,
	type AtprotoAuth,
	type RequestLock
} from '@svelte-atproto/oauth/server';
import { cloudflareKV } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { ALLOW_SIGNUP, DEV_PORT, REDIRECT_PATH, scopes, signUpPDS } from '../settings';
import { atprotoNetwork } from '../network';
import { oauthOrigin } from './origin';

const pending = new Map<string, Promise<unknown>>();

/** Serialize interactive and bot refreshes in this process, as the library's
 * default lock does. This is not a distributed lock across Workers. */
export const oauthRequestLock: RequestLock = async (name, operation) => {
	const previous = pending.get(name);
	const current = (async () => {
		if (previous) await previous.catch(() => {});
		return operation();
	})();
	pending.set(name, current);
	try {
		return await current;
	} finally {
		if (pending.get(name) === current) pending.delete(name);
	}
};

let auth: AtprotoAuth | undefined;

/** Construct lazily: Worker bindings are unavailable during prerender/build. */
export function getAuth(): AtprotoAuth {
	return (auth ??= createAtprotoAuth({
		origin: oauthOrigin(env.OAUTH_PUBLIC_URL),
		cookieSecret: env.COOKIE_SECRET,
		clientAssertionKey: env.CLIENT_ASSERTION_KEY,
		scope: scopes,
		signupPDS: ALLOW_SIGNUP
			? (PUBLIC_SIGNUP_PDS_URL ?? signUpPDS[dev ? 'development' : 'production'])
			: undefined,
		redirectPath: REDIRECT_PATH,
		devPort: DEV_PORT,
		network: atprotoNetwork(),
		requestLock: oauthRequestLock,
		// Pass bindings directly: the library's name-based adapter still reads
		// event.platform, which was removed in SvelteKit 3. Preserve KV keys and
		// the 10-minute state TTL; missing local bindings fall back to memory.
		sessions: () => (env.OAUTH_SESSIONS ? cloudflareKV(env.OAUTH_SESSIONS) : undefined),
		states: () => (env.OAUTH_STATES ? cloudflareKV(env.OAUTH_STATES, { ttl: 600 }) : undefined)
	}));
}
