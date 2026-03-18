import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	listAttendingEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const PREVIEW_LIMIT = 6;

export async function load({ params }) {
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	const now = new Date().toISOString();

	const [profile, upcomingResponse, pastResponse, attendingEvents] = await Promise.all([
		getProfileFromContrail(actor),
		listEventRecordsFromContrail({
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			startsAtMin: now,
			actor,
			limit: PREVIEW_LIMIT + 1
		}),
		listEventRecordsFromContrail({
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'desc',
			startsAtMax: now,
			actor,
			limit: PREVIEW_LIMIT + 1
		}),
		listAttendingEventsFromContrail(actor)
	]);

	const upcomingEvents = upcomingResponse ? flattenEventRecords(upcomingResponse.records) : [];
	const pastEvents = pastResponse ? flattenEventRecords(pastResponse.records) : [];

	return {
		upcomingEvents: upcomingEvents.slice(0, PREVIEW_LIMIT),
		hasMoreUpcoming: upcomingEvents.length > PREVIEW_LIMIT,
		pastEvents: pastEvents.slice(0, PREVIEW_LIMIT),
		hasMorePast: pastEvents.length > PREVIEW_LIMIT,
		attendingEvents,
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
