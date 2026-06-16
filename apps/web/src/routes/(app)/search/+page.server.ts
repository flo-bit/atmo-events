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

	// Keep the degraded path consistent with the Meilisearch path: upcoming only.
	// D1 range params AND together (an endsAt bound would drop events with no
	// endsAt), so this uses the start-based approximation the home list also uses.
	const response = await listDiscoverableEventsFromContrail(client, {
		search: q,
		profiles: true,
		startsAtMin: new Date().toISOString(),
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
		// The D1 fallback is first-batch-only; don't hand its cursor back.
		// loadMoreEvents has no search backend here, so it paginates via
		// listRecords, which applies neither the discoverable filter nor the
		// startsAtMin this page uses — later pages would drift into past and
		// non-discoverable events. (When a configured backend errored the cursor
		// is also unusable: it's a D1 cursor but loadMoreEvents re-routes to Meili
		// whenever a backend is configured.) Drop it in both cases.
		cursor: null,
		query: q
	};
};
