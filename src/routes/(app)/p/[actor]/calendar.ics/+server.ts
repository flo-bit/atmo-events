import { error } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import { generateICalFeed, type ICalEvent } from '$lib/cal/ical';
import { isActorIdentifier, type ActorIdentifier } from '@atcute/lexicons/syntax';
import {
	flattenEventRecord,
	flattenEventRecords,
	getServerClient,
	listEventRecordsFromContrail
} from '$lib/contrail';

export async function GET({ params, platform }) {
	if (!isActorIdentifier(params.actor)) {
		throw error(404, 'Not found');
	}

	const did = await getActor(params.actor);

	if (!did) {
		throw error(404, 'Not found');
	}

	try {
		const client = getServerClient(platform!.env.DB);
		const now = new Date().toISOString();

		const actorId = did as ActorIdentifier;
		const [rsvpResponse, hostingResponse] = await Promise.all([
			client.get('community.lexicon.calendar.rsvp.listRecords', {
				params: { actor: actorId, hydrateEvent: true, limit: 100 }
			}),
			listEventRecordsFromContrail(client, {
				actor: actorId,
				startsAtMin: now,
				sort: 'startsAt',
				order: 'asc',
				limit: 100
			})
		]);

		const nowDate = new Date();

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

		const hostingEvents = hostingResponse ? flattenEventRecords(hostingResponse.records) : [];

		const seen = new Set<string>();
		const allEvents = [...rsvpEvents, ...hostingEvents]
			.filter((e) => {
				if (seen.has(e.uri)) return false;
				seen.add(e.uri);
				return true;
			})
			.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

		const events: ICalEvent[] = allEvents.map((r) => ({
			eventData: r,
			uid: r.uri,
			url: `https://atmo.rsvp/p/${r.did}/e/${r.rkey}`
		}));

		const calendarName = `${params.actor}'s Calendar`;
		const ical = generateICalFeed(events, calendarName);

		return new Response(ical, {
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(500, 'Failed to generate calendar');
	}
}
