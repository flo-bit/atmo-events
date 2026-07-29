import { getServerClient } from '$lib/contrail';
import { EMPTY_PAGE, searchD1Query, searchMeiliQuery } from '$lib/contrail/queries';
import {
	ongoingQuery,
	ongoingSearchQuery,
	withOngoing,
	EMPTY_ONGOING
} from '$lib/contrail/ongoing';
import { searchBackendFromEnv } from '$lib/search/server/query';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const term = url.searchParams.get('q')?.trim() || '';

	if (!term)
		return { ...EMPTY_PAGE, ongoing: [], ongoingTotal: 0, ongoingTotalIsFloor: false, query: '' };

	// Search page 1 does NOT resume from ?cursor=: the term rides ?q=, not the
	// envelope, so an inbound cursor can't be proven to match this route's term.
	// (Load-more still resumes via the remote command, which carries the term.)

	// Meilisearch ranks (typo tolerance, prefix, relevance); D1 supplies the
	// records. Falls back to the LIKE-based D1 path when the search backend is
	// unconfigured (local dev) or down. Only page 1 falls back — a continuation
	// must not switch backends, so the resumers don't (see queries.ts).
	// The band runs on BOTH backends, not just the D1 fallback.
	//
	// Meili's filter does admit ongoing events already
	// (`endsAt >= now OR (endsAt NOT EXISTS AND startsAt >= now)`, search/server/
	// meili.ts), so they are not missing from its results — but they are ranked by
	// RELEVANCE, which says nothing about whether a reader can still get to one.
	// Measured on testnet: "MOTION LONDON" returned 10 results with the single live
	// one at rank 1 — that is luck, and a broader term puts it on page 3. The
	// section is the only thing that guarantees "on right now" is visible without
	// paging. EventList dedupes by uri, so an event Meili already ranked collapses
	// rather than doubling.
	// The band runs on the SAME backend as the list beside it. It used to be D1
	// unconditionally, which made two things disagree that must not: EventList
	// promotes a live event out of the Meili-ranked list into the band, so the band
	// showed events its own query never returned — and "See all" led to a page
	// running that same D1 query, which therefore could not contain them. Measured
	// on testnet: a band of 2 linking to a page of 1. D1 remains the fallback when
	// the backend is unconfigured or down, exactly as the list's own path does.
	const ongoingPromise = ongoingSearchQuery(platform?.env, client, { term })
		.then((band) => band ?? ongoingQuery(client, { search: term }))
		.catch(() => EMPTY_ONGOING);

	const pagePromise = (async () => {
		if (searchBackendFromEnv(platform?.env)) {
			try {
				return await searchMeiliQuery(platform?.env, client, { term }, null);
			} catch (err) {
				console.error('search backend failed, falling back to D1 search:', err);
			}
		}
		return searchD1Query(client, { term }, null);
	})();

	const [page, ongoing] = await Promise.all([pagePromise, ongoingPromise]);
	return { ...(await withOngoing(page, Promise.resolve(ongoing))), query: term };
};
