import type { Client } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons/syntax';
import {
	flattenEventRecord,
	flattenEventRecords,
	listEventRecordsFromContrail
} from '#lib/contrail.js';
import { dedupeByUri } from '#lib/dedupe-by-uri.js';

/** Hosted events plus going/interested RSVPs, as previously shown on /calendar. */
export async function getPersonalEvents(client: Client, did: ActorIdentifier) {
	const [rsvpResponse, hostingResponse] = await Promise.all([
		client.get('rsvp.atmo.rsvp.listRecords', {
			params: { actor: did, hydrateEvent: true, limit: 100 }
		}),
		listEventRecordsFromContrail(client, {
			actor: did,
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

	const all = dedupeByUri([...rsvpEvents, ...hostingEvents]);

	const nowMs = Date.now();
	const upcoming = all
		.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= nowMs)
		.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
	const past = all
		.filter((e) => new Date(e.endsAt || e.startsAt).getTime() < nowMs)
		.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

	return { upcoming, past };
}
