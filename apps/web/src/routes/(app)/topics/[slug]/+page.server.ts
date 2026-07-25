import { error } from '@sveltejs/kit';
import { getTopicBySlug, orQueryFromSlug } from '$lib/topics';
import { getServerClient } from '$lib/contrail';
import { topicQuery } from '$lib/contrail/queries';
import { rawForQuery } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const topic = getTopicBySlug(params.slug);
	if (!topic) error(404, 'Topic not found');

	const client = getServerClient(platform!.env.DB);

	// Deep-link ?cursor= resumes only a 'topic' cursor for this slug; else fresh page 1.
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'topic', { slug: params.slug });

	// The same query load-more continues; it derives the OR-search from the slug
	// server-side, so the query text is never supplied by a caller.
	const page = await topicQuery(client, { slug: params.slug }, cursor);

	return {
		topic,
		...page,
		// Shown in the UI; topicQuery derives the query it runs from the slug with
		// this same helper.
		query: orQueryFromSlug(params.slug) ?? ''
	};
};
