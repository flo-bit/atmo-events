import { error } from '@sveltejs/kit';
import { getCDNImageBlobUrl } from '$lib/atproto/methods.js';
import { getActor } from '$lib/actor';
import { generateICalFeed, type ICalAttendee, type ICalEvent } from '$lib/cal/ical';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import {
	buildEventAttendees,
	flattenEventRecords,
	getHostProfile,
	getServerClient,
	listEventRecordsFromContrail,
	RSVP_HYDRATE_LIMIT
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
		const response = await listEventRecordsFromContrail(client, {
			actor: params.actor,
			hydrateRsvps: RSVP_HYDRATE_LIMIT,
			profiles: true,
			limit: 100
		});

		if (!response) {
			throw error(500, 'Failed to generate calendar');
		}

		const records = flattenEventRecords(response.records);
		const hostProfile = getHostProfile(did, response.profiles);
		const actor = hostProfile?.handle || did;
		const events: ICalEvent[] = await Promise.all(
			records.map(async (r) => {
				const thumbnail = r.media?.find((m) => m.role === 'thumbnail');
				const imageUrl = thumbnail?.content
					? getCDNImageBlobUrl({ did, blob: thumbnail.content })
					: undefined;
				const attendeeGroups = buildEventAttendees(r.rsvps, response.profiles, {
					goingCount: r.rsvpsGoingCount,
					interestedCount: r.rsvpsInterestedCount
				});
				const attendees: ICalAttendee[] = [...attendeeGroups.going, ...attendeeGroups.interested];

				return {
					eventData: r,
					uid: r.uri,
					url: `https://atmo.rsvp/${actor}/e/${r.uri.split('/').pop()}`,
					organizer: actor,
					imageUrl,
					attendees
				};
			})
		);

		const displayName = hostProfile?.displayName;
		const calendarName = `${displayName || actor}'s Events`;
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
