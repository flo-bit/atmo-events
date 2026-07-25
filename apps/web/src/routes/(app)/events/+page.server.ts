import { getServerClient } from '$lib/contrail';
import { eventsQuery } from '$lib/contrail/queries';
import { rawForQuery } from '$lib/contrail/cursor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const client = getServerClient(platform!.env.DB);
	const isPopular = url.searchParams.get('filter') !== 'all';

	// Deep-link ?cursor= resumes only an 'events' cursor minted for the same
	// popular/all filter; anything else -> fresh page 1 (see rawForQuery).
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'events', { popular: isPopular });

	// The same query load-more continues — see queries.ts.
	return eventsQuery(client, { popular: isPopular }, cursor);
};
