import { flattenEventRecords, listEventRecordsFromContrail } from '$lib/contrail';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() || '';
	const cursor = url.searchParams.get('cursor') ?? undefined;

	if (!q) return { events: [], handles: {}, cursor: null, query: '' };

	const response = await listEventRecordsFromContrail({
		search: q,
		profiles: true,
		sort: 'startsAt',
		order: 'desc',
		limit: PAGE_SIZE,
		cursor
	});

	if (!response) return { events: [], handles: {}, cursor: null, query: q };

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events: flattenEventRecords(response.records),
		handles,
		cursor: response.cursor ?? null,
		query: q
	};
};
