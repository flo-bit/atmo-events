import '@atcute/atproto';
import { createAtprotoAuth } from '@svelte-atproto/oauth/server';
import { cloudflareKV } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { env } from '$env/dynamic/private';
import {
	ALLOW_SIGNUP,
	DOH_RESOLVER,
	REDIRECT_PATH,
	scopes,
	signUpPDS
} from '../settings';
import { DEV_PORT } from '../port';

export const atproto = createAtprotoAuth({
	origin: env.OAUTH_PUBLIC_URL,
	cookieSecret: env.COOKIE_SECRET,
	clientAssertionKey: env.CLIENT_ASSERTION_KEY,
	scope: scopes,
	signupPDS: ALLOW_SIGNUP ? signUpPDS : undefined,
	redirectPath: REDIRECT_PATH,
	doh: DOH_RESOLVER,
	devPort: DEV_PORT,
	sessions: cloudflareKV('OAUTH_SESSIONS'),
	states: cloudflareKV('OAUTH_STATES', { ttl: 600 })
});
