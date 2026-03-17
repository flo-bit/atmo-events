import { error } from '@sveltejs/kit';
import type { EventData } from '$lib/event-types';
import { getCDNImageBlobUrl, listRecords } from '$lib/atproto/methods.js';
import type { Did } from '@atcute/lexicons';
import { getActor } from '$lib/actor';
import { generateICalFeed, type ICalAttendee, type ICalEvent } from '$lib/cal/ical';
import { fetchEventRsvps, resolveProfile, getProfileUrl } from '$lib/events/fetch-attendees';
import { loadProfile } from '$lib/atproto/server/profile';

export async function GET({ params, platform, request }) {
	const did = await getActor({ request, paramActor: params.actor, platform });

	if (!did) {
		throw error(404, 'Not found');
	}

	const profileCache = platform?.env?.PROFILE_CACHE;

	try {
		const [records, hostProfile] = await Promise.all([
			listRecords({
				did: did as Did,
				collection: 'community.lexicon.calendar.event',
				limit: 100
			}),
			loadProfile(did as Did, profileCache).catch(() => null)
		]);

		const actor = (hostProfile as Record<string, unknown>)?.handle as string || did;

		// Fetch attendees for all events in parallel
		const events: ICalEvent[] = await Promise.all(
			records.map(async (r) => {
				const eventData = r.value as unknown as EventData;
				const thumbnail = eventData.media?.find((m) => m.role === 'thumbnail');
				const imageUrl = thumbnail?.content
					? getCDNImageBlobUrl({ did, blob: thumbnail.content })
					: undefined;

				// Fetch RSVPs and resolve handles
				const rsvpMap = await fetchEventRsvps(r.uri).catch(() => new Map());
				const attendees: ICalAttendee[] = [];
				await Promise.all(
					Array.from(rsvpMap.entries()).map(async ([attendeeDid, status]) => {
						const profile = await resolveProfile(attendeeDid, profileCache).catch(() => null);
						attendees.push({
							name: profile?.handle || attendeeDid,
							status,
							url: getProfileUrl(attendeeDid, profile)
						});
					})
				);

				return {
					eventData,
					uid: r.uri,
					url: `https://events.atmo.tools/${actor}/e/${r.uri.split('/').pop()}`,
					organizer: actor,
					imageUrl,
					attendees
				};
			})
		);

		const displayName = (hostProfile as Record<string, unknown>)?.displayName as string;
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
