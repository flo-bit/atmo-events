import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	getServerClient,
	listAttendingEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { getSpacesClient } from '$lib/spaces/server/client';
import { spacesAvailable } from '$lib/spaces/config';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const PREVIEW_LIMIT = 6;

export async function load({ params, platform, locals }) {
	// Authenticated viewer + spaces configured → service-auth client so contrail
	// unions public events with private events from spaces the viewer is in.
	// Profile pages show another user's events; the viewer only sees the private
	// ones where *they* are a member (filtered server-side by caller DID).
	const client =
		locals.client && locals.did && spacesAvailable()
			? getSpacesClient(locals.client, platform!.env.DB)
			: getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	const now = new Date().toISOString();

	const [profile, upcomingResponse, pastResponse, attendingEvents] = await Promise.all([
		getProfileFromContrail(client, actor),
		listEventRecordsFromContrail(client, {
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			startsAtMin: now,
			actor,
			limit: PREVIEW_LIMIT + 1
		}),
		listEventRecordsFromContrail(client, {
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'desc',
			startsAtMax: now,
			actor,
			limit: PREVIEW_LIMIT + 1
		}),
		listAttendingEventsFromContrail(client, actor)
	]);

	const nowDate = new Date(now);
	const upcomingEvents = upcomingResponse ? flattenEventRecords(upcomingResponse.records) : [];
	const pastEvents = (pastResponse ? flattenEventRecords(pastResponse.records) : []).filter(
		(e) => new Date(e.endsAt || e.startsAt) < nowDate
	);

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
