import { getCDNImageBlobUrl } from '$lib/atproto/methods.js';
import { ImageResponse } from '@ethercorps/sveltekit-og';
import { error } from '@sveltejs/kit';
import EventOgImage from './EventOgImage.svelte';
import { getActor } from '$lib/actor';
import { flattenEventRecord, getEventRecordFromContrail } from '$lib/contrail';

function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
	const month = date.toLocaleDateString('en-US', { month: 'long' });
	const day = date.getDate();
	return `${weekday}, ${month} ${day}`;
}

export async function GET({ params, platform, request }) {
	const { rkey } = params;

	const did = await getActor(params.actor);

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}

	let eventData;

	try {
		const eventRecord = await getEventRecordFromContrail({ did, rkey });
		eventData = eventRecord ? flattenEventRecord(eventRecord) : null;
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}

	if (!eventData) {
		throw error(404, 'Event not found');
	}

	const dateStr = formatDate(eventData.startsAt);

	let thumbnailUrl: string | null = null;
	if (eventData.media && eventData.media.length > 0) {
		const media =
			eventData.media.find((m) => m.role === 'thumbnail') ??
			eventData.media.find((m) => m.role === 'header');
		if (media?.content) {
			thumbnailUrl = getCDNImageBlobUrl({ did, blob: media.content, format: 'png' }) ?? null;
		}
	}
	return new ImageResponse(
		EventOgImage,
		{ width: 1200, height: 630, debug: false },
		{
			name: eventData.name,
			dateStr,
			thumbnailUrl,
			rkey
		}
	);
}
