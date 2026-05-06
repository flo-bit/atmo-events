import {
	flattenEventRecord,
	flattenEventRecords,
	getServerClient,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { getSpacesClient } from '$lib/spaces/server/client';
import { spacesAvailable } from '$lib/spaces/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.did) {
		return { upcoming: [], past: [], loggedIn: false };
	}
	const client =
		locals.client && spacesAvailable()
			? getSpacesClient(locals.client, platform!.env.DB)
			: getServerClient(platform!.env.DB);

	const [rsvpResponse, hostingResponse] = await Promise.all([
		client.get('rsvp.atmo.rsvp.listRecords', {
			params: { actor: locals.did, hydrateEvent: true, limit: 100 }
		}),
		listEventRecordsFromContrail(client, {
			actor: locals.did,
			sort: 'startsAt',
			order: 'desc',
			limit: 100
		})
	]);

	const rsvpEvents = (rsvpResponse.ok ? (rsvpResponse.data.records ?? []) : [])
		.filter((r) => {
			const status = r.value?.status;
			return status?.endsWith('#going') || status?.endsWith('#interested');
		})
		.flatMap((r) => {
			if (!r.event) return [];
			const flat = flattenEventRecord(r.event);
			return flat ? [flat] : [];
		});

	const hostingEvents = hostingResponse ? flattenEventRecords(hostingResponse.records) : [];

	const seen = new Set<string>();
	const all = [...rsvpEvents, ...hostingEvents].filter((e) => {
		if (seen.has(e.uri)) return false;
		seen.add(e.uri);
		return true;
	});

	const nowMs = Date.now();
	const upcoming = all
		.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= nowMs)
		.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
	const past = all
		.filter((e) => new Date(e.endsAt || e.startsAt).getTime() < nowMs)
		.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

	return { upcoming, past, loggedIn: true, did: locals.did };
};
