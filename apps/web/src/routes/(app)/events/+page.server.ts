import { env } from 'cloudflare:workers';
import { getServerClient } from '#lib/contrail/index.js';
import { eventsQuery } from '#lib/contrail/queries.js';
import { ongoingQuery, withOngoing } from '#lib/contrail/ongoing.js';
import { rawForQuery } from '#lib/contrail/cursor.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const client = getServerClient(env.DB);
	const isPopular = url.searchParams.get('filter') !== 'all';

	// Deep-link ?cursor= resumes only an 'events' cursor minted for the same
	// popular/all filter; anything else -> fresh page 1 (see rawForQuery).
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'events', { popular: isPopular });

	// The ongoing band rides ALONGSIDE the paginated query rather than inside it:
	// bounded, cursorless and capped, so it can lead the list without touching the
	// keyset that continues it. See $lib/contrail/ongoing.ts for why widening this
	// query's own `startsAtMin` bound was measured and rejected instead.
	//
	// Page 1 only. A deep-linked continuation is resuming the upcoming keyset
	// mid-list, where re-sending the band would repeat events already seen above.
	return {
		...(await withOngoing(
			await eventsQuery(client, { popular: isPopular }, cursor),
			cursor ? null : ongoingQuery(client)
		)),
		pageTitle: 'All Upcoming Events'
	};
};
