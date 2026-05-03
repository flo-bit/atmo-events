import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const now = new Date().toISOString();
	const cursor = url.searchParams.get('cursor') ?? undefined;
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
		cursor: response.cursor ?? null
	};
};
