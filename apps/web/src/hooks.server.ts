import { building, dev } from '$app/env';
import { env } from 'cloudflare:workers';
import type { Handle } from '@sveltejs/kit/hooks';
import { getAuth } from '#lib/atproto/server/oauth.js';

import { restoreDevTunnelOrigin } from '#lib/atproto/server/origin.js';

// The library owns OAuth routes, signed cookies, restoration, and revocation.
export const handle: Handle = (input) => {
	if (building) return input.resolve(input.event);
	if (dev) restoreDevTunnelOrigin(input.event.url, env.OAUTH_PUBLIC_URL);
	return getAuth().handle(input);
};
