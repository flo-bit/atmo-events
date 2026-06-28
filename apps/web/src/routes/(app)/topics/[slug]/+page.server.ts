import { error } from '@sveltejs/kit';
import { getTopicBySlug } from '$lib/topics';
import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ params, platform }) => {
	const topic = getTopicBySlug(params.slug);
	if (!topic) error(404, 'Topic not found');

	const client = getServerClient(platform!.env.DB);

	// Match events whose name/description mention ANY of the topic's hashtag
	// terms. The discoverable list runs `search` through D1's SQLite FTS5 MATCH,
	// where an uppercase OR is a real disjunction operator — so this is a true
	// "any term" query. (Meili treats OR as a literal token, but this page never
	// routes through Meili: see the cursor note below.)
	const query = topic.hashtags.map((h) => h.replace(/^#/, '')).join(' OR ');

	const response = await listDiscoverableEventsFromContrail(client, {
		search: query,
		profiles: true,
		// Upcoming-only, soonest first — same shape as the home discovery list.
		startsAtMin: new Date().toISOString(),
		sort: 'startsAt',
		order: 'asc',
		limit: PAGE_SIZE
	});

	const handles: Record<string, string> = {};
	for (const p of response?.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		topic,
		events: flattenEventRecords(response?.records ?? []),
		handles,
		// First-batch-only, like the search page's D1 fallback. This D1 FTS read has
		// no cursor loadMoreEvents can resume: with a search backend configured it
		// re-routes to Meili (whose offset cursor is incompatible with this D1
		// cursor), and without one it paginates via listRecords (dropping the
		// discoverable + startsAtMin filters this page relies on). Either way later
		// pages would drift, so don't hand back a cursor. Deep topic pagination is
		// tracked separately (om-47ak).
		cursor: null,
		query
	};
};
