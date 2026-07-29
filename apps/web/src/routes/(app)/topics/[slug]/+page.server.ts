import { error } from '@sveltejs/kit';
import { getTopicBySlug, orQueryFromSlug } from '$lib/topics';
import { getServerClient } from '$lib/contrail';
import { topicQuery } from '$lib/contrail/queries';
import { ongoingQuery, withOngoing } from '$lib/contrail/ongoing';
import { rawForQuery } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const topic = getTopicBySlug(params.slug);
	if (!topic) error(404, 'Topic not found');

	const client = getServerClient(platform!.env.DB);

	// Deep-link ?cursor= resumes only a 'topic' cursor for this slug; else fresh page 1.
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'topic', { slug: params.slug });

	// The band is scoped by the SAME slug-derived OR-search the topic list runs, so
	// a topic shows what is on in it right now. Derived server-side by the same
	// helper — the query text is never supplied by a caller. Page 1 only, as
	// elsewhere: a continuation is resuming the upcoming keyset mid-list.
	const search = orQueryFromSlug(params.slug) ?? '';
	const page = await topicQuery(client, { slug: params.slug }, cursor);

	return withOngoing(
		{
			topic,
			...page,
			// Shown in the UI; topicQuery derives the query it runs from the slug
			// with this same helper.
			query: search
		},
		cursor || !search ? null : ongoingQuery(client, { search })
	);
};
