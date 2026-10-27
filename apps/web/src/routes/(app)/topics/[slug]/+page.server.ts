import { env } from 'cloudflare:workers';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getTopicBySlug, orQueryFromSlug } from '#lib/topics.js';
import { getServerClient } from '#lib/contrail/index.js';
import { topicQuery } from '#lib/contrail/queries.js';
import { ongoingQuery, withOngoing } from '#lib/contrail/ongoing.js';
import { rawForQuery } from '#lib/contrail/cursor.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const topic = getTopicBySlug(params.slug);
	if (!topic) error(404, 'Topic not found');
	if (topic.slug !== params.slug) {
		redirect(308, resolve('/(app)/topics/[slug]', { slug: topic.slug }));
	}

	const client = getServerClient(env.DB);

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
			pageTitle: `${topic.name} Events`,
			// Shown in the UI; topicQuery derives the query it runs from the slug
			// with this same helper.
			query: search
		},
		cursor || !search ? null : ongoingQuery(client, { search })
	);
};
