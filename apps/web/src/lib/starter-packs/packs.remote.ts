import { env } from 'cloudflare:workers';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import * as v from 'valibot';
import { parseEventUri } from './service';
import { getEventStarterPack } from './runtime';

// Public but same-origin/CSRF-protected by SvelteKit. The caller supplies only an
// event URI: never arbitrary bot record contents, members, repository or URLs.
export const openStarterPack = command(
	v.object({ eventUri: v.pipe(v.string(), v.maxLength(2048)) }),
	async ({ eventUri }) => {
		const request = getRequestEvent();
		// SvelteKit commands already use private, no-store responses; setHeaders is forbidden.
		try {
			parseEventUri(eventUri);
		} catch {
			error(400, 'Invalid event URI');
		}
		if (env.STARTER_PACK_RATE_LIMITER) {
			const { success } = await env.STARTER_PACK_RATE_LIMITER.limit({
				key: request.getClientAddress()
			});
			if (!success) error(429, 'Please try again in a minute');
		}
		try {
			return { url: await getEventStarterPack(env, eventUri) };
		} catch (cause) {
			if (isHttpError(cause)) throw cause;
			console.error('[starter-packs] could not open pack', cause);
			error(503, 'Couldn’t open the starter pack. Please try again.');
		}
	}
);
