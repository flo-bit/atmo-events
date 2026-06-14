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
	let backendFailed = false;
	if (backend) {
		try {
			const page = await runEventSearchPage(backend, client, { q, cursor });
			return { events: page.events, handles: page.handles, cursor: page.cursor, query: q };
		} catch (err) {
			console.error('search backend failed, falling back to D1 search:', err);
			backendFailed = true;
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
		// When a configured backend errored, the D1 cursor is a different format
		// than the Meili offset that loadMoreEvents expects (it re-routes to Meili
		// whenever a backend is configured), so handing it back would break or
		// duplicate the next page. Drop it: the degraded page shows the first
		// batch only. When no backend is configured at all, load-more also uses
		// D1, so the cursor is compatible and we keep it.
		cursor: backendFailed ? null : (response.cursor ?? null),
		query: q
	};
};
