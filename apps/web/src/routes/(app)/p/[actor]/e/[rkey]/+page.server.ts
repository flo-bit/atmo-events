import { error, redirect } from '@sveltejs/kit';
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
import { loadEventTicketing } from '$lib/atm/tickets-data';
import { getAtmHandle } from '$lib/atm/client';
import { atmConfigured } from '$lib/atm/config';
import {
	clearMatchingTicketPurchaseIntent,
	consumeTicketPurchaseResult,
	getTicketPurchaseIntent,
	markTicketPurchaseResult
} from '$lib/atm/ticket-purchase-intent.server';
import {
	clearMatchingTicketRsvpIntent,
	discardTicketRsvpIntentsForEvent,
	getTicketRsvpIntent
} from '$lib/atm/ticket-rsvp-intent.server';
import {
	hasTicketCheckoutReturnParams,
	parseTicketCheckoutReturn,
	ticketPurchaseReturnAction,
	ticketReturnUrlWithoutCheckoutParams
} from '$lib/atm/ticket-rsvp';
import {
	isConferenceEvent,
	getParentEventRef,
	parseEventUri
} from '@atmo-dev/events-ui/conference';
import { getDevBuyerRsvp, isDevBuyerDid } from '$lib/atproto/server/dev-account';

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

export async function load({ params, locals, url, platform, cookies }) {
	const { rkey } = params;

	if (!rkey) {
		throw error(404, 'Event not found');
	}

	// Strip every ATM return parameter before event hydration so a checkout
	// bearer can never reach rendered HTML, logs from downstream loaders, or
	// browser history. The query is not trusted: a result is written only when
	// its token matches our signed HTTP-only intent and ATM confirms the status.
	if (hasTicketCheckoutReturnParams(url)) {
		const checkoutReturn = parseTicketCheckoutReturn(url);
		if (checkoutReturn) {
			const eventUri = `at://${params.actor}/community.lexicon.calendar.event/${rkey}`;
			const expected = { eventUri, checkoutToken: checkoutReturn.checkoutToken };
			const trustedIntent = getTicketPurchaseIntent(cookies, expected);
			let clearRsvpIntent = false;

			if (trustedIntent && platform?.env && atmConfigured(platform.env)) {
				try {
					const handle = await getAtmHandle(platform.env);
					if (handle) {
						try {
							const payment = await handle.atm.getPaymentStatus(checkoutReturn.checkoutToken);
							const action = ticketPurchaseReturnAction(payment.status, checkoutReturn.kind);
							if (action === 'confirmed') {
								markTicketPurchaseResult(cookies, expected, 'confirmed', url.protocol === 'https:');
							} else if (action === 'processing') {
								// The intent and ATM status are real, but settlement/issuance may
								// still be catching up. Render neutral processing copy only.
								markTicketPurchaseResult(
									cookies,
									expected,
									'processing',
									url.protocol === 'https:'
								);
							} else if (action === 'clear') {
								clearMatchingTicketPurchaseIntent(cookies, expected);
								clearRsvpIntent = true;
							}
						} finally {
							try {
								await handle.flush();
							} catch (e) {
								console.warn('[atm] ticket purchase return session flush failed:', e);
							}
						}
					}
				} catch (e) {
					// Any authentication/status failure leaves no success claim. For
					// an explicit cancel return, stop the auto-RSVP poll as well.
					console.warn('[atm] ticket purchase return verification failed:', e);
					if (checkoutReturn.kind === 'cancelled') {
						clearMatchingTicketPurchaseIntent(cookies, expected);
						clearRsvpIntent = true;
					}
				}
			}

			if (clearRsvpIntent && locals.did) {
				clearMatchingTicketRsvpIntent(cookies, {
					buyerDid: locals.did,
					...expected
				});
			}
		}
		throw redirect(303, ticketReturnUrlWithoutCheckoutParams(url));
	}

	const client = getServerClient(platform!.env.DB);

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

	const pendingRsvpIntent = locals.did
		? getTicketRsvpIntent(cookies, { buyerDid: locals.did, eventUri })
		: null;
	const externalSource = (eventData.additionalData as Record<string, unknown> | undefined)
		?.externalSource as { url?: string; rsvpMode?: 'external_only' | 'atmo_too' } | undefined;
	const rsvpControlsAvailable = !(
		(externalSource?.rsvpMode === 'external_only' && !!externalSource.url) ||
		(eventData.endsAt && new Date(eventData.endsAt) < new Date())
	);
	if (pendingRsvpIntent && locals.did && !rsvpControlsAvailable) {
		discardTicketRsvpIntentsForEvent(cookies, { buyerDid: locals.did, eventUri });
	}
	const autoRsvpPending = !!pendingRsvpIntent && rsvpControlsAvailable;

	// Atmosphere Tickets (opt-in): tier availability + the signed-in viewer's
	// own tickets for this event. Resolves to null — and the page renders no
	// tickets section — unless the ATM_* vars are set AND the host configured
	// ticket tiers for this event's AT-URI. Best-effort and started early so it
	// overlaps the hydration fan-out below; it never throws.
	const atmTicketsPromise = loadEventTicketing(platform!.env, eventUri, locals.did, null);

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
			? isDevBuyerDid(locals.did)
				? Promise.resolve(getDevBuyerRsvp(eventUri))
				: getViewerRsvpFromContrail(client, {
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

	// Consume the one-shot, server-verified purchase result only after the event
	// page is otherwise ready. A transient event hydration failure leaves it for
	// a retry, while ticket availability still loads in parallel above.
	const atmTickets = await atmTicketsPromise;
	const purchaseStatus = atmTickets ? consumeTicketPurchaseResult(cookies, eventUri) : null;

	return {
		ogImage: `${url.origin}${url.pathname}/og.png`,
		eventData,
		actorDid: did,
		rkey,
		hostProfile: getHostProfile(did, fullEventRecord.profiles) ?? null,
		attendees,
		viewerRsvpStatus: getRsvpStatus(viewerRsvpRecord?.value?.status as string | undefined),
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
		atmTickets: atmTickets ? { ...atmTickets, purchaseStatus: purchaseStatus ?? undefined } : null,
		autoRsvpPending,
		loggedIn: !!locals.did,
		speakerProfiles: speakerProfiles as Array<{
			id?: string;
			name: string;
			avatar?: string;
			handle?: string;
		}>
	};
}
