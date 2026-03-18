import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const PAGE_SIZE = 20;

export async function load({ params, url }) {
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	const cursor = url.searchParams.get('cursor') ?? undefined;
	const now = new Date().toISOString();

	const [profile, response] = await Promise.all([
		getProfileFromContrail(actor),
		listEventRecordsFromContrail({
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
		cursor: response?.cursor ?? null,
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
