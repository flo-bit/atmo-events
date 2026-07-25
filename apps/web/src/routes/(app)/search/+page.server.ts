import { getServerClient } from '$lib/contrail';
import { EMPTY_PAGE, searchD1Query, searchMeiliQuery } from '$lib/contrail/queries';
import { searchBackendFromEnv } from '$lib/search/server/query';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const term = url.searchParams.get('q')?.trim() || '';

	if (!term) return { ...EMPTY_PAGE, query: '' };

	// Search page 1 does NOT resume from ?cursor=: the term rides ?q=, not the
	// envelope, so an inbound cursor can't be proven to match this route's term.
	// (Load-more still resumes via the remote command, which carries the term.)

	// Meilisearch ranks (typo tolerance, prefix, relevance); D1 supplies the
	// records. Falls back to the LIKE-based D1 path when the search backend is
	// unconfigured (local dev) or down. Only page 1 falls back — a continuation
	// must not switch backends, so the resumers don't (see queries.ts).
	if (searchBackendFromEnv(platform?.env)) {
		try {
			return { ...(await searchMeiliQuery(platform?.env, client, { term }, null)), query: term };
		} catch (err) {
			console.error('search backend failed, falling back to D1 search:', err);
		}
	}

	return { ...(await searchD1Query(client, { term }, null)), query: term };
};
