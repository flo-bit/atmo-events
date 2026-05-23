import { error } from '@sveltejs/kit';
import type { ActorIdentifier, Did } from '@atcute/lexicons';
import { actorToDid } from '$lib/atproto/methods';
import {
	flattenEventRecord,
	getEventRecordFromContrail,
	getHostProfile,
	getProfileBlobUrl,
	getProfileFromContrail,
	getRsvpStatus,
	getServerClient,
	getViewerRsvpFromContrail,
	listEventAttendeesFromContrail,
	withD1Retry,
	RSVP_HYDRATE_LIMIT
} from '$lib/contrail';
import type { Client } from '@atcute/client';
import { vodFromAtUri } from '$lib/vods';

type EventRecord = Awaited<ReturnType<typeof getEventRecordFromContrail>>;

/**
 * Fetch the event record with resilience: retry transient D1 errors, cache
 * successes briefly (Cloudflare Cache API), and fall back to the cached copy
 * when D1 is momentarily unavailable — so a DB hiccup serves slightly-stale
 * data instead of a misleading 404.
 */
async function loadEventRecordResilient(
	client: Client,
	did: string,
	rkey: string
): Promise<EventRecord> {
	// `caches.default` is a Cloudflare extension not in the DOM `CacheStorage`
	// type, and is absent in dev (vite/node) — guard + cast.
	const cache =
		typeof caches !== 'undefined' && 'default' in caches
			? (caches as unknown as { default: Cache }).default
			: null;
	const cacheKey = new Request(`https://event-cache.internal/${did}/${rkey}`);

	try {
		const record = await withD1Retry(() =>
			getEventRecordFromContrail(client, {
				did,
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

	// Resolve the actor (handle→DID). A failure here is almost always transient
	// (DNS / network), not a missing event — surface it as retryable rather than
	// a misleading "not found" the user can't recover from.
	let did: Did;
	try {
		did = await actorToDid(params.actor);
	} catch {
		throw error(503, 'Could not resolve this profile right now — please try again.');
	}

	// Fetch the event (retry + cache fallback). Distinguish "genuinely not
	// indexed" (404) from a transient index/D1 error (503), so a hiccup doesn't
	// masquerade as "not found".
	let eventRecord: EventRecord;
	try {
		eventRecord = await loadEventRecordResilient(client, did, rkey);
	} catch {
		throw error(503, 'Temporarily unavailable — please try again.');
	}

	const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;

	if (!eventData) {
		throw error(404, 'Event not found');
	}

	const fullEventRecord = eventRecord!;
	const isAtmosphereconf = !!(eventData.additionalData as Record<string, unknown> | undefined)
		?.isAtmosphereconf;

	const speakers =
		((eventData.additionalData as Record<string, unknown> | undefined)?.speakers as
			| Array<{ id: string; name: string }>
			| undefined) ?? [];

	const vodAtUri = (eventData.additionalData as Record<string, unknown> | undefined)?.vodAtUri as
		| string
		| undefined;
	const vod = vodAtUri ? vodFromAtUri(vodAtUri) : null;

	// Secondary hydration is best-effort: the event already loaded, so a hiccup
	// fetching attendees/rsvp/speakers must not take down (or 404) the page.
	const [attendees, viewerRsvpRecord, parentEvent, ...speakerProfiles] = await Promise.all([
		listEventAttendeesFromContrail(client, fullEventRecord.uri).catch(() => ({
			going: [],
			interested: [],
			goingCount: 0,
			interestedCount: 0
		})),
		locals.did
			? getViewerRsvpFromContrail(client, {
					eventUri: fullEventRecord.uri,
					actor: locals.did
				}).catch(() => null)
			: null,
		isAtmosphereconf
			? getEventRecordFromContrail(client, {
					did: 'did:plc:lehcqqkwzcwvjvw66uthu5oq',
					rkey: '3lte3c7x43l2e',
					profiles: true
				})
					.then((r) => (r ? flattenEventRecord(r) : null))
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
		vod,
		speakerProfiles: speakerProfiles as Array<{
			id?: string;
			name: string;
			avatar?: string;
			handle?: string;
		}>
	};
}
