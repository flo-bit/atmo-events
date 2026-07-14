import { getCDNImageBlobUrl } from '$lib/atproto/methods.js';
import { ImageResponse } from '@ethercorps/sveltekit-og';
import { error } from '@sveltejs/kit';
import EventOgImage from './EventOgImage.svelte';
import { getActor } from '$lib/actor';
import { flattenEventRecord, getEventRecordFromContrail, getServerClient } from '$lib/contrail';
import { formatInTz, partsInTz } from '@atmo-dev/events-ui';
import { render } from 'svelte/server';

// Short, REVALIDATING cache policy for the OG image. Overrides the library's
// year-long, non-revalidating default that froze social cards at CDNs and
// scrapers, so event edits (renamed event, new date, new thumbnail) never
// surfaced (flo-bit/atmo-events#41). 5m browser / 1h CDN / 1d stale-while-
// revalidate lets edits propagate while keeping unchanged cards cheap.
const CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

/** FNV-1a 32-bit hash to 8-char hex. Deterministic and header-safe. */
function fnv1a(input: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Weak ETag for the OG image. The ATProto record CID rolls whenever the event
 * record's content changes, making it an ideal validator. contrail can hand back
 * a null CID (see flattenEventRecord), so fall back to a hash of every field the
 * rendered card depends on: name, start time, timezone (it sets the date line),
 * and media (the thumbnail). A conditional GET then keeps returning 304 for an
 * unchanged card, while any edit that changes the image also changes the ETag.
 */
function ogEtag(event: {
	cid?: string | null;
	rkey: string;
	startsAt: string;
	name: string;
	timezone?: string | null;
	media?: unknown;
}): string {
	const basis =
		event.cid ??
		`f${fnv1a(
			JSON.stringify([
				event.rkey,
				event.startsAt,
				event.name,
				event.timezone ?? '',
				event.media ?? null
			])
		)}`;
	return `W/"${basis}"`;
}

/**
 * RFC 7232 weak If-None-Match evaluation: matches when the client presents `*`
 * or any tag equal to our ETag under weak comparison (the `W/` prefix is ignored
 * on both sides). Used to short-circuit an unchanged card to a bare 304.
 */
function ifNoneMatchSatisfied(header: string | null, etag: string): boolean {
	if (!header) return false;
	if (header.trim() === '*') return true;
	const stripWeak = (v: string) => v.trim().replace(/^W\//, '');
	const target = stripWeak(etag);
	return header.split(',').some((tag) => stripWeak(tag) === target);
}

function formatDate(dateStr: string, tz: string | undefined): string {
	// Render in the event's authored timezone when known so OG images match
	// what the event page shows, regardless of the edge server's local zone.
	const weekday = formatInTz(dateStr, tz, { weekday: 'long' });
	const month = formatInTz(dateStr, tz, { month: 'long' });
	const day = partsInTz(dateStr, tz, { day: 'numeric' }).day;
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

	// Serve the validator before doing any rendering work: a matching conditional
	// GET returns a bare 304 (no body, no render) so unchanged cards stay cheap.
	const etag = ogEtag(eventData);
	if (ifNoneMatchSatisfied(request.headers.get('if-none-match'), etag)) {
		return new Response(null, {
			status: 304,
			headers: { 'Cache-Control': CACHE_CONTROL, ETag: etag }
		});
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

	// The `headers` override is spread LAST by @ethercorps/sveltekit-og, so it
	// wins over the library's baked-in year-long default and serves our
	// revalidating policy + validator instead.
	return new ImageResponse(decoded, {
		width: 1200,
		height: 630,
		debug: false,
		format: 'png',
		headers: { 'Cache-Control': CACHE_CONTROL, ETag: etag }
	});
}
