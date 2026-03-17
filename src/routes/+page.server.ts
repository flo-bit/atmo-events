import '../lexicon-types/index.js';
import { Client, simpleFetchHandler } from '@atcute/client';
import type { PageServerLoad } from './$types';

const contrail = new Client({
	handler: simpleFetchHandler({ service: 'https://contrail.atmo.tools' })
});

export const load: PageServerLoad = async () => {
	const now = new Date().toISOString();

	const response = await contrail.get('community.lexicon.calendar.event.listRecords', {
		params: {
			startsAtMin: now,
			rsvpsGoingCountMin: 2,
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			limit: 50
		}
	});

	if (!response.ok) return { events: [], profiles: [] };

	return {
		events: response.data.records,
		profiles: response.data.profiles ?? []
	};
};
