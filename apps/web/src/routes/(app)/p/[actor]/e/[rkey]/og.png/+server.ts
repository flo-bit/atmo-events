import { getCDNImageBlobUrl } from '$lib/atproto/methods.js';
import { ImageResponse } from '@ethercorps/sveltekit-og';
import { error } from '@sveltejs/kit';
import EventOgImage from './EventOgImage.svelte';
import { getActor } from '$lib/actor';
import { flattenEventRecord, getEventRecordFromContrail, getServerClient } from '$lib/contrail';
import { formatInTz, partsInTz } from '@atmo-dev/events-ui';
import { render } from 'svelte/server';

function formatDate(dateStr: string, tz: string | undefined): string {
	// Render in the event's authored timezone when known so OG images match
	// what the event page shows, regardless of the edge server's local zone.
	const weekday = formatInTz(dateStr, tz, { weekday: 'long' });
	const month = formatInTz(dateStr, tz, { month: 'long' });
	const day = partsInTz(dateStr, tz, { day: 'numeric' }).day;
	return `${weekday}, ${month} ${day}`;
}

export async function GET({ params, platform }) {
	const { rkey } = params;

	const did = await getActor(params.actor);

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}

	let eventData;

	try {
		const client = getServerClient(platform!.env.DB);
		const eventRecord = await getEventRecordFromContrail(client, { did, rkey });
		eventData = eventRecord ? flattenEventRecord(eventRecord) : null;
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}

	if (!eventData) {
		throw error(404, 'Event not found');
	}

	const dateStr = formatDate(eventData.startsAt, eventData.timezone);

	let thumbnailUrl: string | null = null;
	if (eventData.media && eventData.media.length > 0) {
		const media =
			eventData.media.find((m) => m.role === 'thumbnail') ??
			eventData.media.find((m) => m.role === 'header');
		if (media?.content) {
			thumbnailUrl = getCDNImageBlobUrl({ did, blob: media.content, format: 'png' }) ?? null;
		}
	}
	const { body } = render(EventOgImage, {
		props: { name: eventData.name, dateStr, thumbnailUrl, rkey }
	});
	// Decode HTML entities that Svelte SSR escapes, since satori-html doesn't decode them
	const decoded = body
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");

	return new ImageResponse(
		decoded,
		{ width: 1200, height: 630, debug: false, format: 'png' }
	);
}
