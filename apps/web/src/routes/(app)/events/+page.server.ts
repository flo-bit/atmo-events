import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { nextCursor, rawForQuery } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const now = new Date().toISOString();
	const isPopular = url.searchParams.get('filter') !== 'all';
	// Deep-link ?cursor= resumes only an 'events' cursor minted for the same
	// popular/all filter; anything else -> fresh page 1 (see rawForQuery).
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'events', { popular: isPopular });

	const response = await listDiscoverableEventsFromContrail(client, {
		startsAtMin: now,
		profiles: true,
		sort: 'startsAt',
		order: 'asc',
		limit: PAGE_SIZE,
		cursor,
		...(isPopular ? { rsvpsCountMin: 2 } : {})
	});

	if (!response) return { events: [], handles: {}, cursor: null };

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events: flattenEventRecords(response.records),
		handles,
		// A self-describing envelope: load-more re-runs THIS server-side query
		// (discoverable + startsAtMin=now + the popular toggle), no client filters.
		cursor: nextCursor('events', response.cursor ?? null, { popular: isPopular })
	};
};
