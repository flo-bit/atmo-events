import { env, waitUntil } from 'cloudflare:workers';
import {
	buildAttendee,
	flattenEventRecord,
	flattenEventRecords,
	getHostProfile,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail,
	withD1Retry,
	type ActivityCluster
} from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
import { cachedRead } from '#lib/server/edge-cache.js';
import { dedupeByUri } from '#lib/dedupe-by-uri.js';
import { holdsGuestGrant, holdsHostGrant } from '#lib/private-events/scopes.js';
import { privateEventsBeta } from '#lib/private-events/server/beta.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';
import { myPrivateEvents, type MyPrivateEvent } from '#lib/private-events/server/events.js';
import { withPrivateEvents, type PrivateLink } from '#lib/private-events/your-events.js';
import { errorKind } from '#lib/spaces/server/xrpc.js';
import type { PageServerLoad } from './$types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** Raw records pulled for the activity feed before JS-side filtering/clustering
 *  down to ACTIVITY_DISPLAY_LIMIT. Recent RSVPs concentrate on popular events,
 *  so a modest window still yields a full set of clusters — fetching more just
 *  hydrates events we throw away. */
const ACTIVITY_FETCH_LIMIT = 75;
const ACTIVITY_DISPLAY_LIMIT = 10;
/** TTL for the global (non-personalized) home-page surfaces. They're identical
 *  for every visitor, so we serve them from the colo edge cache and only hit D1
 *  on a miss. Short enough that new events/RSVPs surface within ~a minute. */
const GLOBAL_CACHE_TTL_S = 60;
/** Activity feed includes RSVPs to events that ended within this window so
 *  recently-finished events linger briefly (their RSVPs are still meaningful
 *  social signal). */
const ACTIVITY_RECENT_EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** How long Your events waits on the person's own server for their private events before it shows
 *  their public ones alone. */
const PRIVATE_EVENTS_WAIT_MS = 4000;

/** Their own private events, hosted or answered, for Your events: only with private events and their
 *  beta on, and a grant to read them. Null when there are none to add. `incomplete` when some may be
 *  missing: a read failed or ran out of time, or there were more than were listed. The page never
 *  waits long or fails for them. */
async function ownPrivateEvents(
	locals: App.Locals
): Promise<{ events: MyPrivateEvent[]; incomplete: boolean } | null> {
	if (!locals.did || !privateEventsEnabled()) return null;
	// The session and its grant are known here; only the beta setting is on their server, so it is
	// asked last, and someone without a grant costs this page nothing.
	let betaOn = false;
	const read = async () => {
		const caller = await callerSession(locals.session ?? null);
		if (!caller) return null;
		if (!holdsGuestGrant(caller.scope) && !holdsHostGrant(caller.scope, caller.did)) return null;
		if (!(await privateEventsBeta(locals))) return null;
		betaOn = true;
		const { events, incomplete } = await myPrivateEvents(caller);
		return { events, incomplete };
	};
	// Kept going past the wait: a Worker cuts off what a response leaves running, which could leave
	// their session's lock held and stall their next request.
	const reading = read();
	waitUntil(reading.catch(() => {}));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((resolve) => {
		timer = setTimeout(() => resolve('late'), PRIVATE_EVENTS_WAIT_MS);
	});
	try {
		const found = await Promise.race([reading, late]);
		if (found !== 'late') return found;
		return betaOn ? { events: [], incomplete: true } : null;
	} catch (e) {
		console.error(`[private-events] private events unread for the home page: ${errorKind(e)}`);
		return betaOn ? { events: [], incomplete: true } : null;
	} finally {
		clearTimeout(timer);
	}
}

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const publicClient = getServerClient(env.DB);
	const nowIso = new Date().toISOString();

	const myEventsPromise = (async () => {
		if (!locals.did) return { upcoming: [], past: [] };
		const did = locals.did;

		const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
		const cutoffIso = cutoff.toISOString();

		const [rsvpResponse, hostingResponse] = await withD1Retry(() =>
			Promise.all([
				publicClient.get('rsvp.atmo.rsvp.listRecords', {
					params: { actor: did, hydrateEvent: true, limit: 100 }
				}),
				listEventRecordsFromContrail(publicClient, {
					actor: did,
					startsAtMin: cutoffIso,
					sort: 'startsAt',
					order: 'asc',
					limit: 100
				})
			])
		);

		const rsvpEvents = (rsvpResponse.ok ? (rsvpResponse.data.records ?? []) : [])
			.filter((r) => {
				const status = r.value?.status;
				return status?.endsWith('#going') || status?.endsWith('#interested');
			})
			.flatMap((r) => {
				if (!r.event) return [];
				const flat = flattenEventRecord(r.event);
				return flat ? [flat] : [];
			})
			.filter((e) => new Date(e.endsAt || e.startsAt) >= cutoff);

		const hostingEvents = hostingResponse ? flattenEventRecords(hostingResponse.records) : [];

		const all = dedupeByUri([...rsvpEvents, ...hostingEvents]);

		const nowMs = Date.now();
		const upcoming = all
			.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= nowMs)
			.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
		const past = all
			.filter((e) => new Date(e.endsAt || e.startsAt).getTime() < nowMs)
			.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

		return { upcoming, past };
	})();

	// Global discovery list — same for every visitor, so cache it at the edge.
	// The key is static (no per-request `nowIso`), so a hit just means the
	// `startsAtMin` filter is up to one TTL stale — harmless for "upcoming".
	const globalPromise = cachedRead('home:discoverable', GLOBAL_CACHE_TTL_S, () =>
		withD1Retry(() =>
			listDiscoverableEventsFromContrail(publicClient, {
				startsAtMin: nowIso,
				rsvpsCountMin: 2,
				hydrateRsvps: 5,
				sort: 'startsAt',
				order: 'asc',
				limit: 20
			})
		)
	);

	// listRecords and getFeed return structurally identical rsvp records, but TS
	// sees them as nominally-distinct lex types. Cast inputs to the structural
	// minimum we actually use.
	type ActivityRsvp = {
		did: string;
		collection: string;
		uri: string;
		value?: { status?: string; createdAt?: string };
		event?: Parameters<typeof flattenEventRecord>[0];
	};
	type ActivityProfile = Parameters<typeof buildAttendee>[2] extends Array<infer P> | undefined
		? P
		: never;

	type ActivityEvent = {
		did: string;
		uri: string;
		value?: { startsAt?: string; endsAt?: string | null; createdAt?: string };
	};

	function addRsvpsToClusters(
		records: ActivityRsvp[],
		profiles: ActivityProfile[],
		clusters: Map<string, ActivityCluster>
	) {
		const nowMs = Date.now();
		for (const r of records) {
			const status = r.value?.status;
			const isGoing = status?.endsWith('#going');
			const isInterested = status?.endsWith('#interested');
			if (!isGoing && !isInterested) continue;
			if (!r.event) continue;
			const flatEvent = flattenEventRecord(r.event);
			if (!flatEvent) continue;
			const eventEndMs = new Date(flatEvent.endsAt || flatEvent.startsAt).getTime();
			if (eventEndMs < nowMs - ACTIVITY_RECENT_EVENT_WINDOW_MS) continue;

			const attendee = buildAttendee(r.did, isGoing ? 'going' : 'interested', profiles);
			const createdAtMs = r.value?.createdAt ? new Date(r.value.createdAt).getTime() : 0;
			let cluster = clusters.get(flatEvent.uri);
			if (!cluster) {
				cluster = { event: flatEvent, attendees: [], latestCreatedAtMs: createdAtMs };
				clusters.set(flatEvent.uri, cluster);
			}
			cluster.attendees.push(attendee);
			if (createdAtMs > cluster.latestCreatedAtMs) cluster.latestCreatedAtMs = createdAtMs;
		}
	}

	/** Add events authored by people the viewer follows to existing rsvp-driven
	 *  clusters (or create new clusters for events with no follow-RSVPs). The
	 *  cluster's `host` field flags author-is-a-follow so the UI can render
	 *  "Hosted by X" when there are no attendees. */
	function addFollowEventsToClusters(
		records: ActivityEvent[],
		profiles: ActivityProfile[],
		clusters: Map<string, ActivityCluster>
	) {
		const nowMs = Date.now();
		for (const e of records) {
			const flatEvent = flattenEventRecord(e as Parameters<typeof flattenEventRecord>[0]);
			if (!flatEvent) continue;
			const eventEndMs = new Date(flatEvent.endsAt || flatEvent.startsAt).getTime();
			if (eventEndMs < nowMs - ACTIVITY_RECENT_EVENT_WINDOW_MS) continue;

			const host = getHostProfile(flatEvent.did, profiles) ?? undefined;
			const eventCreatedAtMs = e.value?.createdAt ? new Date(e.value.createdAt).getTime() : 0;
			let cluster = clusters.get(flatEvent.uri);
			if (!cluster) {
				cluster = {
					event: flatEvent,
					attendees: [],
					host,
					latestCreatedAtMs: eventCreatedAtMs
				};
				clusters.set(flatEvent.uri, cluster);
			} else {
				// Existing rsvp-driven cluster gets host attribution layered on.
				cluster.host = cluster.host ?? host;
			}
		}
	}

	function finalizeClusters(map: Map<string, ActivityCluster>): ActivityCluster[] {
		return Array.from(map.values())
			.sort((a, b) => b.latestCreatedAtMs - a.latestCreatedAtMs)
			.slice(0, ACTIVITY_DISPLAY_LIMIT);
	}

	// Global activity is identical for every visitor; cache the fully-clustered
	// result so a hit skips the record hydrate AND the clustering work.
	function fetchGlobalActivity(): Promise<ActivityCluster[]> {
		return cachedRead('home:global-activity', GLOBAL_CACHE_TTL_S, async () => {
			const response = await withD1Retry(() =>
				publicClient.get('rsvp.atmo.rsvp.listRecords', {
					params: {
						hydrateEvent: true,
						profiles: true,
						sort: 'createdAt',
						order: 'desc',
						limit: ACTIVITY_FETCH_LIMIT
					}
				})
			);
			if (!response.ok) return [];
			const clusters = new Map<string, ActivityCluster>();
			addRsvpsToClusters(
				(response.data.records ?? []) as ActivityRsvp[],
				(response.data.profiles ?? []) as ActivityProfile[],
				clusters
			);
			return finalizeClusters(clusters);
		});
	}

	const recentActivityPromise = (async (): Promise<{
		activity: ActivityCluster[];
		isPersonalized: boolean;
	}> => {
		// Logged-in: pull both RSVPs and events authored by people the viewer
		// follows, merge into one cluster set keyed by event URI. RSVP clusters
		// + event clusters that point at the same event collapse — the host info
		// just gets layered on. If the merged set is empty (cold start), fall
		// back to the global recent-RSVP feed.
		if (locals.did) {
			const did = locals.did;
			const [rsvpResp, eventResp] = await withD1Retry(() =>
				Promise.all([
					publicClient.get('rsvp.atmo.getFeed', {
						params: {
							feed: 'network',
							actor: did,
							collection: 'rsvp',
							hydrateEvent: true,
							profiles: true,
							sort: 'createdAt',
							order: 'desc',
							limit: ACTIVITY_FETCH_LIMIT
						}
					}),
					publicClient.get('rsvp.atmo.getFeed', {
						params: {
							feed: 'network',
							actor: did,
							collection: 'event',
							profiles: true,
							sort: 'startsAt',
							order: 'asc',
							// Only events still upcoming or recent. Server-side filter is
							// possible here because startsAt IS in the event collection's
							// queryable (unlike rsvp records, which carry no event date).
							startsAtMin: new Date(Date.now() - ACTIVITY_RECENT_EVENT_WINDOW_MS).toISOString(),
							limit: ACTIVITY_FETCH_LIMIT
						}
					})
				])
			);

			const clusters = new Map<string, ActivityCluster>();
			if (rsvpResp.ok) {
				addRsvpsToClusters(
					(rsvpResp.data.records ?? []) as ActivityRsvp[],
					(rsvpResp.data.profiles ?? []) as ActivityProfile[],
					clusters
				);
			}
			if (eventResp.ok) {
				addFollowEventsToClusters(
					(eventResp.data.records ?? []) as ActivityEvent[],
					(eventResp.data.profiles ?? []) as ActivityProfile[],
					clusters
				);
			}
			if (clusters.size > 0) return { activity: finalizeClusters(clusters), isPersonalized: true };
		}
		return { activity: await fetchGlobalActivity(), isPersonalized: false };
	})();

	const [publicOnes, response, recentActivityResult, ownPrivate] = await Promise.all([
		myEventsPromise,
		globalPromise,
		recentActivityPromise,
		ownPrivateEvents(locals)
	]);
	const { activity: recentActivity, isPersonalized: recentActivityIsPersonalized } =
		recentActivityResult;
	// Their own private events join their public ones, seen only by them, so this page is kept nowhere.
	let myEvents: { upcoming: typeof publicOnes.upcoming; past: typeof publicOnes.past } = publicOnes;
	let privateLinks: Record<string, PrivateLink> = {};
	if (ownPrivate && ownPrivate.events.length > 0) {
		const now = Date.now();
		({ privateLinks, ...myEvents } = withPrivateEvents(
			publicOnes,
			ownPrivate.events,
			now,
			now - SEVEN_DAYS_MS
		));
	}
	// Saying some are missing tells as much as listing them does.
	const privateEventsIncomplete = ownPrivate?.incomplete ?? false;
	if (Object.keys(privateLinks).length > 0 || privateEventsIncomplete) {
		setHeaders({ 'cache-control': 'private, no-store' });
	}

	if (!response) {
		return {
			events: [],
			handles: {} as Record<string, string>,
			myUpcoming: myEvents.upcoming,
			myPast: myEvents.past,
			privateLinks,
			privateEventsIncomplete,
			recentActivity,
			recentActivityIsPersonalized
		};
	}

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events: flattenEventRecords(response.records),
		handles,
		myUpcoming: myEvents.upcoming,
		myPast: myEvents.past,
		privateLinks,
		privateEventsIncomplete,
		recentActivity,
		recentActivityIsPersonalized
	};
};
