import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { parseCursor, tagCursor } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const now = new Date().toISOString();
	// Untag any inbound cursor (deep link) before handing the opaque keyset to D1;
	// legacy untagged cursors pass through unchanged (om-7dbs).
	const cursor = parseCursor(url.searchParams.get('cursor')).raw ?? undefined;
	const isPopular = url.searchParams.get('filter') !== 'all';

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
		// Tag the first-page cursor so load-more routes back to this same D1
		// discoverable pipeline instead of re-inferring a backend (om-7dbs).
		cursor: tagCursor('d1', response.cursor ?? null)
	};
};
