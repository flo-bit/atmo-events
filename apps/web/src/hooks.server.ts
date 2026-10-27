import { building } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { getAuth } from '#lib/atproto/server/oauth.js';

// The library owns OAuth routes, signed cookies, restoration, and revocation.
export const handle: Handle = (input) =>
	building ? input.resolve(input.event) : getAuth().handle(input);
