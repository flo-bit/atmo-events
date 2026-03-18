import { flattenEventRecords, listEventRecordsFromContrail } from '$lib/contrail';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date().toISOString();

	const response = await listEventRecordsFromContrail({
		startsAtMin: now,
		rsvpsGoingCountMin: 2,
		hydrateRsvps: 5,
		profiles: true,
		sort: 'startsAt',
		order: 'asc',
		limit: 20
	});

	if (!response) return { events: [], handles: {} };

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events: flattenEventRecords(response.records),
		handles
	};
};
