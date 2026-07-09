import { error } from '@sveltejs/kit';
import { getTopicBySlug, orQueryFromSlug } from '$lib/topics';
import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { nextCursor, rawForQuery } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const topic = getTopicBySlug(params.slug);
	if (!topic) error(404, 'Topic not found');

	const client = getServerClient(platform!.env.DB);

	// Match events whose name/description mention ANY of the topic's hashtag
	// terms. The discoverable list runs `search` through D1's SQLite FTS5 MATCH,
	// where an uppercase OR is a real disjunction operator — so this is a true
	// "any term" query. Derived SERVER-side from the slug via the shared helper the
	// load-more registry also uses, so page 1 and load-more can't drift.
	const query = orQueryFromSlug(params.slug) ?? '';

	const response = await listDiscoverableEventsFromContrail(client, {
		search: query,
		profiles: true,
		// Upcoming-only, soonest first — same shape as the home discovery list.
		startsAtMin: new Date().toISOString(),
		sort: 'startsAt',
		order: 'asc',
		limit: PAGE_SIZE,
		// Deep-link ?cursor= resumes only a 'topic' cursor for this slug; else fresh page 1.
		cursor: rawForQuery(url.searchParams.get('cursor'), 'topic', { slug: params.slug })
	});

	const handles: Record<string, string> = {};
	for (const p of response?.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		topic,
		events: flattenEventRecords(response?.records ?? []),
		handles,
		// Self-describing 'topic' envelope carrying the slug: load-more re-derives
		// the same OR-search from the slug SERVER-side and re-runs the identical
		// discoverable + startsAtMin query — later pages stay upcoming-only and
		// discoverable.
		cursor: nextCursor('topic', response?.cursor ?? null, { slug: params.slug }),
		query
	};
};
