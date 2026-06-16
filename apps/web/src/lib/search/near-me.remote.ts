import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { getServerClient } from '$lib/contrail/index';
import { runNearMePage, searchBackendFromEnv } from './server/query';
import { nearMeInput } from './near-me-input';

/** Geo query function: events within a radius, nearest first. One of the two
 *  endpoints backed by Meilisearch (with `search`); requires the backend —
 *  there is no D1 fallback for geo. */
export const loadNearMeEvents = command(nearMeInput, async (input) => {
	const { platform } = getRequestEvent();

	const backend = searchBackendFromEnv(platform?.env);
	if (!backend) error(503, 'Search is not configured on this deployment');

	const client = getServerClient(platform!.env.DB);
	const page = await runNearMePage(backend, client, {
		lat: input.lat,
		lng: input.lng,
		radiusMeters: input.radiusMeters,
		cursor: input.cursor ?? null
	});

	return {
		events: page.events,
		handles: page.handles,
		cursor: page.cursor,
		distances: page.distances
	};
});
