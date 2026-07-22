import {
	flattenEventRecord,
	flattenEventRecords,
	getServerClient,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { getSpacesClient } from '$lib/spaces/server/client';
import { spacesAvailable } from '$lib/spaces/config';
import { dedupeByUri } from '$lib/dedupe-by-uri';
import { loadViewerTicketBadges } from '$lib/atm/tickets-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store, max-age=0' });

	if (!locals.did) {
		return {
			upcoming: [],
			past: [],
			ticketBadges: {} as Record<string, string>,
			loggedIn: false
		};
	}
	const client =
		locals.client && spacesAvailable()
			? getSpacesClient(locals.client, platform!.env.DB)
			: getServerClient(platform!.env.DB);

	const [rsvpResponse, hostingResponse, ticketBadges] = await Promise.all([
		client.get('rsvp.atmo.rsvp.listRecords', {
			params: { actor: locals.did, hydrateEvent: true, limit: 100 }
		}),
		listEventRecordsFromContrail(client, {
			actor: locals.did,
			sort: 'startsAt',
			order: 'desc',
			limit: 100
		}),
		loadViewerTicketBadges(platform!.env, locals.did)
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

	const all = dedupeByUri([...rsvpEvents, ...hostingEvents]);

	const nowMs = Date.now();
	const upcoming = all
		.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= nowMs)
		.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
	const past = all
		.filter((e) => new Date(e.endsAt || e.startsAt).getTime() < nowMs)
		.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

	return { upcoming, past, ticketBadges, loggedIn: true, did: locals.did };
};
