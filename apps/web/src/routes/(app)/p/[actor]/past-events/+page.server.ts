import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	getServerClient,
	listAuthoredEventsFromContrail
} from '$lib/contrail';
import { nextCursor, rawForQuery } from '$lib/contrail/cursor';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const PAGE_SIZE = 20;

export async function load({ params, url, platform }) {
	const client = getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	// Deep-link ?cursor= resumes only a 'past-events' cursor for this actor; else fresh page 1.
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'past-events', { actor });
	const now = new Date().toISOString();

	const [profile, response] = await Promise.all([
		getProfileFromContrail(client, actor),
		listAuthoredEventsFromContrail(client, {
			profiles: true,
			sort: 'startsAt',
			order: 'desc',
			startsAtMax: now,
			actor,
			limit: PAGE_SIZE,
			cursor
		})
	]);

	const nowDate = new Date(now);
	const events = (response ? flattenEventRecords(response.records) : []).filter(
		(e) => new Date(e.endsAt || e.startsAt) < nowDate
	);

	return {
		events,
		// Self-describing envelope: load-more re-runs the authored + past query
		// (desc, startsAtMax=now) scoped to this actor, server-side.
		cursor: nextCursor('past-events', response?.cursor ?? null, { actor }),
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
