import { error } from '@sveltejs/kit';
import { getTopicBySlug } from '$lib/topics';
import {
	flattenEventRecords,
	getServerClient,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const topic = getTopicBySlug(params.slug);
	if (!topic) error(404, 'Topic not found');

	const cursor = url.searchParams.get('cursor') ?? undefined;
	const terms = topic.hashtags.map((h) => h.replace(/^#/, ''));
	const query = terms.join(' OR ');

	const client = getServerClient(platform!.env.DB);

	const response = await listDiscoverableEventsFromContrail(client, {
		search: query,
		profiles: true,
		sort: 'startsAt',
		order: 'desc',
		limit: PAGE_SIZE,
		cursor
	});

	const handles: Record<string, string> = {};
	for (const p of response?.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	return {
		topic,
		events: flattenEventRecords(response?.records ?? []),
		handles,
		cursor: response?.cursor ?? null
	};
};
