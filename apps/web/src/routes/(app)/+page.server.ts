import {
	buildAttendee,
	flattenEventRecord,
	flattenEventRecords,
	getHostProfile,
	getServerClient,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail,
	type ActivityCluster,
	type HostProfile
} from '$lib/contrail';
import { getSpacesClient } from '$lib/spaces/server/client';
import { spacesAvailable } from '$lib/spaces/config';
import type { PageServerLoad } from './$types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_FETCH_LIMIT = 200;
const ACTIVITY_DISPLAY_LIMIT = 10;
/** Activity feed includes RSVPs to events that ended within this window so
 *  recently-finished events linger briefly (their RSVPs are still meaningful
 *  social signal). */
const ACTIVITY_RECENT_EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ locals, platform }) => {
	const publicClient = getServerClient(platform!.env.DB);
	const nowIso = new Date().toISOString();

	const myEventsPromise = (async () => {
		if (!locals.did) return { upcoming: [], past: [] };

		const client =
			locals.client && spacesAvailable()
				? getSpacesClient(locals.client, platform!.env.DB)
				: publicClient;

		const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
		const cutoffIso = cutoff.toISOString();

		const [rsvpResponse, hostingResponse] = await Promise.all([
			client.get('rsvp.atmo.rsvp.listRecords', {
				params: { actor: locals.did, hydrateEvent: true, limit: 100 }
			}),
			listEventRecordsFromContrail(client, {
				actor: locals.did,
				startsAtMin: cutoffIso,
				sort: 'startsAt',
				order: 'asc',
				limit: 100
			})
		]);

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

		const seen = new Set<string>();
		const all = [...rsvpEvents, ...hostingEvents].filter((e) => {
			if (seen.has(e.uri)) return false;
			seen.add(e.uri);
			return true;
		});

		const nowMs = Date.now();
		const upcoming = all
			.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= nowMs)
			.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
		const past = all
			.filter((e) => new Date(e.endsAt || e.startsAt).getTime() < nowMs)
			.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

		return { upcoming, past };
	})();

	const globalPromise = listDiscoverableEventsFromContrail(publicClient, {
		startsAtMin: nowIso,
		rsvpsCountMin: 2,
		hydrateRsvps: 5,
		sort: 'startsAt',
		order: 'asc',
		limit: 20
	});

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

	async function fetchGlobalActivity(): Promise<ActivityCluster[]> {
		const response = await publicClient.get('rsvp.atmo.rsvp.listRecords', {
			params: {
				hydrateEvent: true,
				profiles: true,
				sort: 'createdAt',
				order: 'desc',
				limit: ACTIVITY_FETCH_LIMIT
			}
		});
		if (!response.ok) return [];
		const clusters = new Map<string, ActivityCluster>();
		addRsvpsToClusters(
			(response.data.records ?? []) as ActivityRsvp[],
			(response.data.profiles ?? []) as ActivityProfile[],
			clusters
		);
		return finalizeClusters(clusters);
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
			const [rsvpResp, eventResp] = await Promise.all([
				publicClient.get('rsvp.atmo.getFeed', {
					params: {
						feed: 'network',
						actor: locals.did,
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
						actor: locals.did,
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
			]);

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

	const [myEvents, response, recentActivityResult] = await Promise.all([
		myEventsPromise,
		globalPromise,
		recentActivityPromise
	]);
	const { activity: recentActivity, isPersonalized: recentActivityIsPersonalized } =
		recentActivityResult;

	if (!response) {
		return {
			events: [],
			handles: {},
			myUpcoming: myEvents.upcoming,
			myPast: myEvents.past,
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
		recentActivity,
		recentActivityIsPersonalized
	};
};
