import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	getServerClient,
	listAuthoredEventsFromContrail
} from '$lib/contrail';
import { parseCursor, tagCursor } from '$lib/contrail/cursor';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const PAGE_SIZE = 20;

export async function load({ params, url, platform }) {
	const client = getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	// Untag any inbound cursor before the D1 read; legacy untagged passes through.
	const cursor = parseCursor(url.searchParams.get('cursor')).raw ?? undefined;
	const now = new Date().toISOString();

	const [profile, response] = await Promise.all([
		getProfileFromContrail(client, actor),
		listAuthoredEventsFromContrail(client, {
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			startsAtMin: now,
			actor,
			limit: PAGE_SIZE,
			cursor
		})
	]);

	return {
		events: response ? flattenEventRecords(response.records) : [],
		// Tag so load-more stays on this D1 authored pipeline (om-7dbs).
		cursor: tagCursor('d1', response?.cursor ?? null),
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
