import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { getEventThumbnail } from '@atmo-dev/events-ui';
import { getCDNImageBlobUrl } from '@svelte-atproto/oauth/bsky';
import { getActor } from '#lib/actor.js';
import { generateICalFeed, type ICalAttendee, type ICalEvent } from '#lib/cal/ical.js';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import {
	buildEventAttendees,
	flattenEventRecords,
	getHostProfile,
	listEventRecordsFromContrail,
	RSVP_HYDRATE_LIMIT
} from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';

export async function GET({ params }) {
	if (!isActorIdentifier(params.actor)) {
		throw error(404, 'Not found');
	}

	const did = await getActor(params.actor);

	if (!did) {
		throw error(404, 'Not found');
	}

	try {
		const client = getServerClient(env.DB);
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
				const thumbnail = getEventThumbnail(r.media);
				const imageUrl = thumbnail?.content
					? getCDNImageBlobUrl({ did, blob: thumbnail.content })
					: undefined;
				const attendeeGroups = buildEventAttendees(
					r.rsvps as Parameters<typeof buildEventAttendees>[0],
					response.profiles,
					{
						goingCount: r.rsvpsGoingCount,
						interestedCount: r.rsvpsInterestedCount
					}
				);
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
				'Cache-Control': 'no-store'
			}
		});
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(500, 'Failed to generate calendar');
	}
}
