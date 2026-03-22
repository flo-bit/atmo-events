import { flattenEventRecords, listEventRecordsFromContrail, type FlatEventRecord } from '$lib/contrail';
import { listMyEvents } from '$lib/openmeet/client';
import type { OpenMeetEvent } from '$lib/openmeet/types';
import type { PageServerLoad } from './$types';

export type ContrailDisplayEvent = {
	source: 'contrail';
	sortDate: string;
	event: FlatEventRecord;
	actor?: string;
};

export type OpenMeetDisplayEvent = {
	source: 'openmeet';
	sortDate: string;
	event: OpenMeetEvent;
};

export type DisplayEvent = ContrailDisplayEvent | OpenMeetDisplayEvent;

export const load: PageServerLoad = async ({ locals }) => {
	const now = new Date().toISOString();

	// Fetch public events from Contrail (always)
	const contrailPromise = listEventRecordsFromContrail({
		startsAtMin: now,
		rsvpsGoingCountMin: 2,
		hydrateRsvps: 5,
		sort: 'startsAt',
		order: 'asc',
		limit: 20
	});

	// Fetch private events from OpenMeet (if authenticated)
	const openmeetPromise = locals.openmeetToken
		? listMyEvents(locals.openmeetToken, { fromDate: now, limit: 20 })
		: Promise.resolve([]);

	const [contrailResponse, privateEvents] = await Promise.all([contrailPromise, openmeetPromise]);

	// Build handles map from Contrail profiles
	const handles: Record<string, string> = {};
	if (contrailResponse) {
		for (const p of contrailResponse.profiles ?? []) {
			if (p.handle) handles[p.did] = p.handle;
		}
	}

	// Flatten Contrail events
	const publicEvents = contrailResponse ? flattenEventRecords(contrailResponse.records) : [];

	// Build a set of atprotoUris from Contrail for dedup
	const contrailUris = new Set(publicEvents.map((e) => e.uri).filter(Boolean));

	// Filter OpenMeet events: only include those NOT already in Contrail
	// (private events won't have atprotoUri, so they always pass through)
	const uniquePrivateEvents = privateEvents.filter(
		(e: OpenMeetEvent) => !e.uri || !contrailUris.has(e.uri)
	);

	// Merge into a single sorted array
	const allEvents: DisplayEvent[] = [
		...publicEvents.map((e): ContrailDisplayEvent => ({
			source: 'contrail',
			sortDate: e.startsAt,
			event: e,
			actor: handles[e.did]
		})),
		...uniquePrivateEvents.map((e): OpenMeetDisplayEvent => ({
			source: 'openmeet',
			sortDate: e.startsAt,
			event: e
		}))
	].sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());

	return {
		events: allEvents,
		handles
	};
};
