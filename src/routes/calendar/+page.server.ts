import { flattenEventRecord, contrail } from '$lib/contrail';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		return { events: [], loggedIn: false };
	}

	const response = await contrail.get('community.lexicon.calendar.rsvp.listRecords', {
		params: { actor: locals.did, hydrateEvent: true, limit: 100 }
	});

	const now = new Date();
	const events = (response.ok ? (response.data.records ?? []) : [])
		.filter((r) => {
			const status = r.record?.status;
			return status?.endsWith('#going') || status?.endsWith('#interested');
		})
		.flatMap((r) => {
			if (!r.event) return [];
			const flat = flattenEventRecord(r.event);
			return flat ? [flat] : [];
		})
		.filter((e) => new Date(e.endsAt || e.startsAt) >= now)
		.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

	return { events, loggedIn: true };
};
