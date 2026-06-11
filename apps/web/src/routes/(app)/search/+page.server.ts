import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
import { SEARCH_PAGE_SIZE } from '$lib/search/constants';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const q = url.searchParams.get('q')?.trim() || '';
	const cursor = url.searchParams.get('cursor') ?? undefined;

	if (!q) return { events: [], handles: {}, cursor: null, query: '' };

	// Meilisearch ranks (typo tolerance, prefix, relevance); D1 supplies the
	// records. Falls back to the LIKE-based D1 path when the search backend is
	// unconfigured (local dev) or down.
	const backend = searchBackendFromEnv(platform?.env);
	if (backend) {
		try {
			const page = await runEventSearchPage(backend, client, { q, cursor });
			return { events: page.events, handles: page.handles, cursor: page.cursor, query: q };
		} catch (err) {
			console.error('search backend failed, falling back to D1 search:', err);
		}
	}

	const response = await listDiscoverableEventsFromContrail(client, {
		search: q,
		profiles: true,
		sort: 'startsAt',
		order: 'desc',
		limit: SEARCH_PAGE_SIZE,
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
