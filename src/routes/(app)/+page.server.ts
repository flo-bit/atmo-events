import {
	buildAttendee,
	flattenEventRecord,
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail,
	type ActivityCluster
} from '$lib/contrail';
import { getSpacesClient } from '$lib/spaces/server/client';
import { spacesAvailable } from '$lib/spaces/config';
import type { PageServerLoad } from './$types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_FETCH_LIMIT = 100;
const ACTIVITY_DISPLAY_LIMIT = 10;

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
		rsvpsGoingCountMin: 2,
		hydrateRsvps: 5,
		sort: 'startsAt',
		order: 'asc',
		limit: 20
	});

	const recentActivityPromise = (async (): Promise<ActivityCluster[]> => {
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

		const records = response.data.records ?? [];
		const profiles = response.data.profiles ?? [];
		const nowMs = Date.now();
		const clusters = new Map<string, ActivityCluster>();

		for (const r of records) {
			const status = r.value?.status;
			const isGoing = status?.endsWith('#going');
			const isInterested = status?.endsWith('#interested');
			if (!isGoing && !isInterested) continue;

			if (!r.event) continue;
			const flatEvent = flattenEventRecord(r.event);
			if (!flatEvent) continue;

			const eventEndMs = new Date(flatEvent.endsAt || flatEvent.startsAt).getTime();
			if (eventEndMs < nowMs) continue;

			const attendee = buildAttendee(r.did, isGoing ? 'going' : 'interested', profiles);
			// `createdAt` is an atproto convention all RSVPs carry, even though the
			// community.lexicon.calendar.rsvp schema doesn't formally declare it.
			const createdAt = (r.value as { createdAt?: string } | undefined)?.createdAt;
			const createdAtMs = createdAt ? new Date(createdAt).getTime() : 0;

			let cluster = clusters.get(flatEvent.uri);
			if (!cluster) {
				cluster = { event: flatEvent, attendees: [], latestCreatedAtMs: createdAtMs };
				clusters.set(flatEvent.uri, cluster);
			}
			cluster.attendees.push(attendee);
			if (createdAtMs > cluster.latestCreatedAtMs) cluster.latestCreatedAtMs = createdAtMs;
		}

		return Array.from(clusters.values())
			.sort((a, b) => b.latestCreatedAtMs - a.latestCreatedAtMs)
			.slice(0, ACTIVITY_DISPLAY_LIMIT);
	})();

	const [myEvents, response, recentActivity] = await Promise.all([
		myEventsPromise,
		globalPromise,
		recentActivityPromise
	]);

	if (!response) {
		return {
			events: [],
			handles: {},
			myUpcoming: myEvents.upcoming,
			myPast: myEvents.past,
			recentActivity
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
		recentActivity
	};
};
