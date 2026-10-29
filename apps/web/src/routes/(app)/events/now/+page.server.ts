import { env } from 'cloudflare:workers';
import { getServerClient } from '#lib/contrail/index.js';
import { happeningNowQuery } from '#lib/contrail/queries.js';
import { rawForQuery } from '#lib/contrail/cursor.js';
import { getTopicBySlug } from '#lib/topics.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const client = getServerClient(env.DB);
	const slug = url.searchParams.get('topic') ?? undefined;
	const topic = slug ? getTopicBySlug(slug) : undefined;
	const term = url.searchParams.get('q')?.trim() || undefined;
	const cursor = term
		? undefined
		: rawForQuery(url.searchParams.get('cursor'), 'happening-now', topic ? { slug } : undefined);
	const page =
		slug && !topic
			? { events: [], handles: {}, cursor: null }
			: await happeningNowQuery(client, cursor, { slug: topic ? slug : undefined, search: term });
	return {
		...page,
		pageTitle: 'Happening Now',
		scopeLabel: topic?.name ?? term,
		term,
		slug: topic ? slug : undefined
	};
};
