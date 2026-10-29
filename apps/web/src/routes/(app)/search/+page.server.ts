import { env } from 'cloudflare:workers';
import { getServerClient } from '#lib/contrail/index.js';
import { EMPTY_PAGE, searchD1Query } from '#lib/contrail/queries.js';
import { ongoingQuery, withOngoing } from '#lib/contrail/ongoing.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const term = url.searchParams.get('q')?.trim() || '';
	if (!term)
		return {
			...EMPTY_PAGE,
			pageTitle: 'Search Events',
			query: '',
			ongoing: [],
			ongoingTotal: 0,
			ongoingTotalIsFloor: false
		};
	const client = getServerClient(env.DB);
	// Search terms stay outside cursor envelopes. Page one never accepts an
	// inbound cursor; the load-more command carries the term explicitly.
	const [page, ongoing] = await Promise.all([
		searchD1Query(client, { term }, null),
		ongoingQuery(client, { term })
	]);
	return {
		...(await withOngoing(page, Promise.resolve(ongoing))),
		pageTitle: `"${term}" - Search`,
		query: term
	};
};
