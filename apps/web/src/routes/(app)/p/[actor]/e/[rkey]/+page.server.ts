import { env } from 'cloudflare:workers';
import { recordAtTags } from '@atmo-dev/kit/at-tags';
import { error } from '@sveltejs/kit';
import type { ActorIdentifier } from '@atcute/lexicons';
import {
	eventAttendeesFromRecord,
	flattenEventRecord,
	flattenEventRecords,
	getEventRecordFromContrail,
	getHostProfile,
	getProfileBlobUrl,
	getProfileFromContrail,
	getRsvpStatus,
	getViewerRsvpFromContrail,
	listConferenceTalksFromContrail,
	withD1Retry,
	RSVP_HYDRATE_LIMIT
} from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
import type { Client } from '@atcute/client';
import { vodFromAtUri } from '#lib/vods.js';
import { eventDescriptionTexts, parseEventDescription } from '#lib/server/event-description.js';
import { richTextToPlainText } from '@atmo-dev/kit/richtext';
import { isConferenceEvent, getParentEventRef, parseEventUri } from '@atmo-dev/kit/events-data';
import { conferenceTalksActor } from '#lib/legacy-conference.js';

type EventRecord = Awaited<ReturnType<typeof getEventRecordFromContrail>>;

/** Retry transient reads, but never serve stale content without checking current
 * moderation. A database outage must fail closed rather than resurrect a hide. */
async function loadEventRecordResilient(
	client: Client,
	actor: string,
	rkey: string
): Promise<EventRecord> {
	return withD1Retry(() =>
		getEventRecordFromContrail(client, {
			did: actor,
			rkey,
			hydrateRsvps: RSVP_HYDRATE_LIMIT,
			profiles: true
		})
	);
}

export async function load({ params, locals, url }) {
	const client = getServerClient(env.DB);
	const { rkey } = params;

	if (!rkey) {
		throw error(404, 'Event not found');
	}

	// Fetch the event by actor (handle or DID) — contrail resolves a handle in
	// the URI authority server-side, so there's no separate app-side resolution
	// step. Retrying distinguishes a transient index/D1 error (503)
	// from a genuinely-missing event (404).
	let eventRecord: EventRecord;
	try {
		eventRecord = await loadEventRecordResilient(client, params.actor, rkey);
	} catch {
		throw error(503, 'Temporarily unavailable — please try again.');
	}

	const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;

	if (!eventData) {
		throw error(404, 'Event not found');
	}

	const fullEventRecord = eventRecord!;
	const eventUri = fullEventRecord.uri;
	// Canonical DID from the resolved record — use this (not params.actor, which
	// may be a handle) for all downstream lookups that need a DID.
	const did = eventData.did;

	// A conference is just an event with type=conference; its talks are events
	// pointing back at it via additionalData.parentEvent.
	const isConference = isConferenceEvent(eventData);
	const parentRef = getParentEventRef(eventData);
	const parentParts = parentRef ? parseEventUri(parentRef.uri) : null;

	const speakers =
		((eventData.additionalData as Record<string, unknown> | undefined)?.speakers as
			Array<{ id: string; name: string }> | undefined) ?? [];

	const vodAtUri = (eventData.additionalData as Record<string, unknown> | undefined)?.vodAtUri as
		string | undefined;
	const vod = vodAtUri ? vodFromAtUri(vodAtUri) : null;

	// The avatar strip renders from the RSVPs hydrated onto the record above. The
	// full list (two 200-row profile hydrations, seconds on large events) is
	// fetched by `loadAttendees` only when someone opens a list.
	const attendees = eventAttendeesFromRecord(fullEventRecord);

	// Secondary hydration is best-effort: the event already loaded, so a hiccup
	// fetching rsvp/parent/talks/speakers must not take down (or 404) the page.
	const [
		viewerRsvpRecord,
		parentRecord,
		conferenceTalksResp,
		conferenceRsvpResp,
		...speakerProfiles
	] = await Promise.all([
		locals.did
			? getViewerRsvpFromContrail(client, {
					eventUri,
					actor: locals.did
				}).catch(() => null)
			: null,
		// Resolve the parent conference (for the "Part of" card on a talk page).
		parentParts
			? getEventRecordFromContrail(client, {
					did: parentParts.did,
					rkey: parentParts.rkey,
					profiles: true
				}).catch(() => null)
			: null,
		// On a conference event, fetch its talks (organizer-authored for now).
		isConference
			? listConferenceTalksFromContrail(client, {
					parentUri: eventUri,
					actor: conferenceTalksActor(eventUri, did) as ActorIdentifier
				}).catch(() => null)
			: null,
		// The viewer's RSVPs, so the timetable can show per-talk going/interested.
		isConference && locals.did
			? client
					.get('rsvp.atmo.rsvp.listRecords', {
						params: { actor: locals.did as ActorIdentifier, limit: 200 }
					})
					.catch(() => null)
			: null,
		...speakers.map((s) =>
			s.id
				? getProfileFromContrail(client, s.id as ActorIdentifier)
						.then((p) => ({
							id: s.id,
							name: s.name,
							avatar: p?.value?.avatar ? getProfileBlobUrl(p.did, p.value.avatar) : undefined,
							handle: p?.handle || s.id
						}))
						.catch(() => ({ id: s.id, name: s.name, avatar: undefined, handle: s.id }))
				: Promise.resolve({ id: undefined, name: s.name, avatar: undefined, handle: undefined })
		)
	]);

	const parentEvent = parentRecord ? flattenEventRecord(parentRecord) : null;
	const parentEventActor = parentParts
		? (getHostProfile(parentParts.did, parentRecord?.profiles)?.handle ?? parentParts.did)
		: null;
	// Conference talks → schedule maps (RSVP status/rkey + VODs keyed by event URI).
	const conferenceTalks = conferenceTalksResp
		? flattenEventRecords(conferenceTalksResp.records)
		: [];
	const conferenceRsvpStatuses: Record<string, string> = {};
	const conferenceRsvpRkeys: Record<string, string> = {};
	if (conferenceRsvpResp?.ok) {
		for (const r of conferenceRsvpResp.data.records ?? []) {
			const status = r.value?.status;
			const subjectUri = r.value?.subject?.uri;
			if (status && subjectUri) {
				conferenceRsvpStatuses[subjectUri] = status.split('#').pop()!;
				if (r.rkey) conferenceRsvpRkeys[subjectUri] = r.rkey;
			}
		}
	}
	const conferenceVods: Record<string, { playlistUrl: string; subtitlesUrl?: string }> = {};
	for (const talk of conferenceTalks) {
		const talkVod = (talk.additionalData as Record<string, unknown> | undefined)?.vodAtUri as
			string | undefined;
		if (talkVod)
			conferenceVods[talk.uri] = {
				...vodFromAtUri(talkVod),
				subtitlesUrl: `/vods/${talk.rkey}-karaoke.vtt`
			};
	}

	const description = parseEventDescription(eventData);

	return {
		atTags: recordAtTags(fullEventRecord, [
			...(parentEvent ? [parentEvent] : []),
			...conferenceTalks
		]),
		pageTitle: eventData.name,
		reportSubject: eventData.cid
			? {
					$type: 'com.atproto.repo.strongRef' as const,
					uri: eventData.uri,
					cid: eventData.cid
				}
			: undefined,
		starterPacksEnabled: !!env.BOT_IDENTIFIER && !!env.BOT_APP_PASSWORD,
		pageDescription:
			(description && richTextToPlainText(description)) || `Event: ${eventData.name}`,
		ogImage: `${url.origin}${url.pathname}/og.png`,
		eventData,
		description,
		actorDid: did,
		rkey,
		hostProfile: getHostProfile(did, fullEventRecord.profiles) ?? null,
		attendees,
		viewerRsvpStatus: getRsvpStatus(viewerRsvpRecord?.value?.status),
		viewerRsvpRkey: viewerRsvpRecord?.rkey ?? null,
		parentEvent,
		parentEventActor,
		vod,
		isConference,
		conferenceTalks,
		conferenceTalkDescriptions: eventDescriptionTexts(conferenceTalks),
		conferenceTimezone: eventData.timezone ?? 'UTC',
		conferenceRsvpStatuses,
		conferenceRsvpRkeys,
		conferenceVods,
		loggedIn: !!locals.did,
		speakerProfiles: speakerProfiles as Array<{
			id?: string;
			name: string;
			avatar?: string;
			handle?: string;
		}>
	};
}
