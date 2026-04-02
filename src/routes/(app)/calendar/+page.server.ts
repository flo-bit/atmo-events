import {
	flattenEventRecord,
	flattenEventRecords,
	getServerClient,
	listEventRecordsFromContrail
} from '$lib/contrail';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const client = getServerClient(platform!.env.DB);
	if (!locals.did) {
		return { events: [], loggedIn: false };
	}

	const now = new Date().toISOString();

	const [rsvpResponse, hostingResponse] = await Promise.all([
		client.get('community.lexicon.calendar.rsvp.listRecords', {
			params: { actor: locals.did, hydrateEvent: true, limit: 100 }
		}),
		listEventRecordsFromContrail(client, {
			actor: locals.did,
			startsAtMin: now,
			sort: 'startsAt',
			order: 'asc',
			limit: 100
		})
	]);

	const nowDate = new Date();

	// Events from RSVPs
	const rsvpEvents = (rsvpResponse.ok ? (rsvpResponse.data.records ?? []) : [])
		.filter((r) => {
			const status = r.record?.status;
			return status?.endsWith('#going') || status?.endsWith('#interested');
		})
		.flatMap((r) => {
			if (!r.event) return [];
			const flat = flattenEventRecord(r.event);
			return flat ? [flat] : [];
		})
		.filter((e) => new Date(e.endsAt || e.startsAt) >= nowDate);

	// Events the user is hosting
	const hostingEvents = hostingResponse ? flattenEventRecords(hostingResponse.records) : [];

	// Merge and deduplicate
	const seen = new Set<string>();
	const events = [...rsvpEvents, ...hostingEvents]
		.filter((e) => {
			if (seen.has(e.uri)) return false;
			seen.add(e.uri);
			return true;
		})
		.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

	return { events, loggedIn: true, did: locals.did };
};
