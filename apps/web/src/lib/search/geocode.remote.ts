import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { geocodeLocation } from './server/geocode';
import { geocodeInput } from './geocode-input';

/** Resolve a free-text address / zip / place name to coordinates so the
 *  near-me page works without device location. Runs server-side so the
 *  geocoder sees the Worker, not the user. Returns null when nothing
 *  matches (distinct from upstream failure, which is a 502). */
export const geocodeQuery = command(geocodeInput, async ({ q }) => {
	const { platform } = getRequestEvent();
	try {
		return await geocodeLocation(q, fetch, platform?.env);
	} catch {
		error(502, 'Location lookup is unavailable right now');
	}
});
