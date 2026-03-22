import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	listAttendingEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { listMyEvents } from '$lib/openmeet/client';
import type { OpenMeetEvent } from '$lib/openmeet/types';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const PREVIEW_LIMIT = 6;

export async function load({ params, locals }: { params: { actor: string }; locals: App.Locals }) {
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	const now = new Date().toISOString();
	const isOwnProfile = locals.did === did;

	const [profile, upcomingResponse, pastResponse, attendingEvents, openmeetEvents] =
		await Promise.all([
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
			listAttendingEventsFromContrail(actor),
			isOwnProfile && locals.openmeetToken
				? listMyEvents(locals.openmeetToken, { fromDate: now, limit: 20 })
				: Promise.resolve([] as OpenMeetEvent[])
		]);

	const nowDate = new Date(now);
	const upcomingEvents = upcomingResponse ? flattenEventRecords(upcomingResponse.records) : [];
	const pastEvents = (pastResponse ? flattenEventRecords(pastResponse.records) : []).filter(
		(e) => new Date(e.endsAt || e.startsAt) < nowDate
	);

	// Dedup OpenMeet events that are already in Contrail's attending list
	const attendingUris = new Set(
		(attendingEvents ?? []).map((e) => e.uri).filter(Boolean)
	);
	// Only include OpenMeet events the user is actually attending (not just has access to)
	const activeRsvpStatuses = new Set(['confirmed', 'pending', 'waitlist']);
	const privateAttending = openmeetEvents.filter(
		(e: OpenMeetEvent) =>
			e.userRsvpStatus &&
			activeRsvpStatuses.has(e.userRsvpStatus) &&
			(!e.uri || !attendingUris.has(e.uri))
	);

	return {
		upcomingEvents: upcomingEvents.slice(0, PREVIEW_LIMIT),
		hasMoreUpcoming: upcomingEvents.length > PREVIEW_LIMIT,
		pastEvents: pastEvents.slice(0, PREVIEW_LIMIT),
		hasMorePast: pastEvents.length > PREVIEW_LIMIT,
		attendingEvents,
		privateAttending,
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
