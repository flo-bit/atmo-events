import { getActor } from '$lib/actor';
import {
	flattenEventRecords,
	getProfileFromContrail,
	getServerClient,
	listAttendingEventsFromContrail,
	listAuthoredEventsFromContrail
} from '$lib/contrail';
import { EMPTY_ONGOING, ongoingQuery } from '$lib/contrail/ongoing';
import { hasEnded } from '$lib/past-events';
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
	// `listAuthored` is a public pipelineQuery, not a declared lexicon method, so
	// the service-auth spaces client can't mint a JWT for it (the PDS 403s). Route
	// the public event listings through the in-process server client instead —
	// matching the hosting/past-events pages, which already use it.
	const publicClient = getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	const now = new Date().toISOString();

	const [profile, upcomingResponse, pastResponse, attendingEvents, ongoing] = await Promise.all([
		getProfileFromContrail(client, actor),
		listAuthoredEventsFromContrail(publicClient, {
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			startsAtMin: now,
			actor,
			limit: PREVIEW_LIMIT + 1
		}),
		listAuthoredEventsFromContrail(publicClient, {
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'desc',
			startsAtMax: now,
			actor,
			limit: PREVIEW_LIMIT + 1
		}),
		listAttendingEventsFromContrail(client, actor),
		// No PER-ACTOR cap — this is the actor's own page, where that cap (which
		// exists to stop one publisher dominating a SHARED list) would only hide
		// their work from them. But this is a PREVIEW, so it takes a total bound
		// instead; /p/<actor>/hosting runs the band with neither.
		//
		// Empty band on failure, never a rejection: this is gathered by the
		// Promise.all above alongside the reads a profile genuinely cannot render
		// without, and an optional section must not be able to fail the page. The
		// same guarantee `withOngoing` gives the routes that use it.
		ongoingQuery(publicClient, { actor }).catch(() => EMPTY_ONGOING)
	]);

	const upcomingEvents = upcomingResponse ? flattenEventRecords(upcomingResponse.records) : [];
	// Was an inlined copy of this predicate; call the shared one so the "is it
	// over" rule has a single definition across past-events and this preview.
	const pastEvents = (pastResponse ? flattenEventRecords(pastResponse.records) : []).filter((e) =>
		hasEnded(e, now)
	);

	// Live events get their OWN preview-sized section, so they no longer eat the
	// upcoming section's slots. They were previously in NEITHER section: the
	// upcoming query bounds on startsAtMin and hasEnded() excludes them from past.
	//
	// The band itself is uncapped for a profile — a profile IS this host's list, so
	// the one-card-per-host rule has nothing to do here — which is exactly why the
	// preview needs its own ceiling: one host running 21 live events would
	// otherwise render 21 cards above everything else.
	const ongoingEvents = ongoing.events.slice(0, PREVIEW_LIMIT);

	return {
		ongoingEvents,
		ongoingTotal: ongoing.total,
		ongoingTotalIsFloor: ongoing.totalIsFloor,
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
