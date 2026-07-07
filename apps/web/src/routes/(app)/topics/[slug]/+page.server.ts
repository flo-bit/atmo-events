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
		// First-batch-only, like the search page's D1 fallback. Self-describing
		// cursors (om-7dbs) now stop this page's D1 cursor from being mis-consumed
		// as a Meili offset, but they don't make it resumable here: this fetchParams
		// contract carries no `pipeline`, so a d1-tagged cursor would still route
		// load-more through plain listRecords, dropping the discoverable +
		// startsAtMin filters this page relies on. So don't hand back a cursor. Deep
		// topic pagination (threading the discoverable pipeline through) is tracked
		// separately (om-47ak).
		cursor: null,
		query
	};
};
