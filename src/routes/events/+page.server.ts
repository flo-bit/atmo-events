import { flattenEventRecords, listEventRecordsFromContrail } from '$lib/contrail';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ url }) => {
	const now = new Date().toISOString();
	const cursor = url.searchParams.get('cursor') ?? undefined;

	const response = await listEventRecordsFromContrail({
		startsAtMin: now,
		profiles: true,
		sort: 'startsAt',
		order: 'asc',
		limit: PAGE_SIZE,
		cursor
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
