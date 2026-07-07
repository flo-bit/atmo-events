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
		// The D1 fallback is first-batch-only; don't hand its cursor back. Even
		// with self-describing cursors (om-7dbs), the search fetchParams carry no
		// `pipeline`, so a d1-tagged cursor would route load-more through plain
		// listRecords — dropping the discoverable filter and startsAtMin this page
		// applies — and later pages would drift into past and non-discoverable
		// events. Re-enabling consistent D1 pagination here would mean threading the
		// discoverable pipeline + filters through; deferred. Drop the cursor.
		cursor: null,
		query: q
	};
};
