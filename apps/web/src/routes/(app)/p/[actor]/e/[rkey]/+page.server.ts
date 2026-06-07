import { error } from '@sveltejs/kit';
import type { ActorIdentifier } from '@atcute/lexicons';
import {
	flattenEventRecord,
	flattenEventRecords,
	getEventRecordFromContrail,
	getHostProfile,
	getProfileBlobUrl,
	getProfileFromContrail,
	getRsvpStatus,
	getServerClient,
	getViewerRsvpFromContrail,
	listConferenceTalksFromContrail,
	listEventAttendeesFromContrail,
	withD1Retry,
	RSVP_HYDRATE_LIMIT
} from '$lib/contrail';
import type { Client } from '@atcute/client';
import { vodFromAtUri } from '$lib/vods';
import { isConferenceEvent, getParentEventRef, parseEventUri } from '@atmo-dev/events-ui/conference';

type EventRecord = Awaited<ReturnType<typeof getEventRecordFromContrail>>;

/**
 * Fetch the event record with resilience: retry transient D1 errors, cache
 * successes briefly (Cloudflare Cache API), and fall back to the cached copy
 * when D1 is momentarily unavailable — so a DB hiccup serves slightly-stale
 * data instead of a misleading 404.
 */
async function loadEventRecordResilient(
	client: Client,
	actor: string,
	rkey: string
): Promise<EventRecord> {
	// `caches.default` is a Cloudflare extension not in the DOM `CacheStorage`
	// type, and is absent in dev (vite/node) — guard + cast.
	const cache =
		typeof caches !== 'undefined' && 'default' in caches
			? (caches as unknown as { default: Cache }).default
			: null;
	const cacheKey = new Request(`https://event-cache.internal/${actor}/${rkey}`);

	try {
		// `actor` may be a handle or DID — contrail's getRecord resolves a handle
		// authority in the URI (from its local identities table), so we skip the
		// app's own network handle resolution entirely.
		const record = await withD1Retry(() =>
			getEventRecordFromContrail(client, {
				did: actor,
				rkey,
				hydrateRsvps: RSVP_HYDRATE_LIMIT,
				profiles: true
			})
		);
		if (record && cache) {
			await cache.put(
				cacheKey,
				new Response(JSON.stringify(record), { headers: { 'cache-control': 'max-age=120' } })
			);
		}
		return record;
	} catch (e) {
		if (cache) {
			const cached = await cache.match(cacheKey);
			if (cached) return (await cached.json()) as EventRecord;
		}
		throw e;
	}
}

export async function load({ params, locals, url, platform }) {
	const client = getServerClient(platform!.env.DB);
	const { rkey } = params;

	if (!rkey) {
		throw error(404, 'Event not found');
	}

	// Fetch the event by actor (handle or DID) — contrail resolves a handle in
	// the URI authority server-side, so there's no separate app-side resolution
	// step. Retry + cache fallback distinguishes a transient index/D1 error (503)
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
	// Back-compat: atmosphereconf talks predate `parentEvent` (they carry an
	// `isAtmosphereconf` flag instead). Point them at the conference event until
	// the migration backfills `additionalData.parentEvent`. Remove after that.
	const legacyAtmosphereconf = !!(eventData.additionalData as Record<string, unknown> | undefined)
		?.isAtmosphereconf;
	const parentParts = parentRef
		? parseEventUri(parentRef.uri)
		: legacyAtmosphereconf
			? { did: 'did:plc:lehcqqkwzcwvjvw66uthu5oq', rkey: '3lte3c7x43l2e' }
			: null;

	const speakers =
		((eventData.additionalData as Record<string, unknown> | undefined)?.speakers as
			| Array<{ id: string; name: string }>
			| undefined) ?? [];

	const vodAtUri = (eventData.additionalData as Record<string, unknown> | undefined)?.vodAtUri as
		| string
		| undefined;
	const vod = vodAtUri ? vodFromAtUri(vodAtUri) : null;

	// Secondary hydration is best-effort: the event already loaded, so a hiccup
	// fetching attendees/rsvp/parent/talks/speakers must not take down (or 404)
	// the page.
	const [
		attendees,
		viewerRsvpRecord,
		parentRecord,
		conferenceTalksResp,
		conferenceRsvpResp,
		...speakerProfiles
	] = await Promise.all([
		listEventAttendeesFromContrail(client, eventUri).catch(() => ({
			going: [],
			interested: [],
			goingCount: 0,
			interestedCount: 0
		})),
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
					actor: did as ActorIdentifier
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
	// Legacy atmosphereconf talks link to the dedicated schedule route rather
	// than the conference event page (which only renders a timetable once the
	// event is migrated to type=conference). Drop after migration.
	const parentScheduleUrl = !parentRef && legacyAtmosphereconf ? '/p/atmosphereconf.org' : null;

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
			| string
			| undefined;
		if (talkVod)
			conferenceVods[talk.uri] = {
				...vodFromAtUri(talkVod),
				subtitlesUrl: `/vods/${talk.rkey}-karaoke.vtt`
			};
	}

	return {
		ogImage: `${url.origin}${url.pathname}/og.png`,
		eventData,
		actorDid: did,
		rkey,
		hostProfile: getHostProfile(did, fullEventRecord.profiles) ?? null,
		attendees,
		viewerRsvpStatus: getRsvpStatus(viewerRsvpRecord?.value?.status),
		viewerRsvpRkey: viewerRsvpRecord?.rkey ?? null,
		parentEvent,
		parentEventActor,
		parentScheduleUrl,
		vod,
		isConference,
		conferenceTalks,
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
