import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
import { SEARCH_PAGE_SIZE } from '$lib/search/constants';
import { nextCursor } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const q = url.searchParams.get('q')?.trim() || '';

	if (!q) return { events: [], handles: {}, cursor: null, query: '' };

	// Search page 1 does NOT resume from ?cursor=: the term rides ?q=, not the
	// envelope, so an inbound cursor can't be proven to match this route's term.
	// (Load-more still resumes via the remote command, which carries the term.)

	// Meilisearch ranks (typo tolerance, prefix, relevance); D1 supplies the
	// records. Falls back to the LIKE-based D1 path when the search backend is
	// unconfigured (local dev) or down.
	const backend = searchBackendFromEnv(platform?.env);
	if (backend) {
		try {
			const page = await runEventSearchPage(backend, client, { q });
			return {
				events: page.events,
				handles: page.handles,
				cursor: nextCursor('search-meili', page.cursor),
				query: q
			};
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
		limit: SEARCH_PAGE_SIZE
	});

	if (!response) return { events: [], handles: {}, cursor: null, query: q };

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		events: flattenEventRecords(response.records),
		handles,
		// Self-describing 'search-d1' envelope: load-more re-runs the SAME
		// discoverable + startsAtMin + desc query, with the search term from ?q=/
		// input — later pages stay upcoming-only and discoverable, no drift into
		// past/non-discoverable events.
		cursor: nextCursor('search-d1', response.cursor ?? null),
		query: q
	};
};
