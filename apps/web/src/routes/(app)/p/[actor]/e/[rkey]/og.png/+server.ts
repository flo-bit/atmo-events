import { getCDNImageBlobUrl } from '$lib/atproto/methods.js';
import { ImageResponse } from '@ethercorps/sveltekit-og';
import { error } from '@sveltejs/kit';
import EventOgImage from './EventOgImage.svelte';
import { getActor } from '$lib/actor';
import { flattenEventRecord, getEventRecordFromContrail } from '$lib/contrail';
import { getServerClient } from '$lib/contrail/index';
import { formatInTz, partsInTz } from '@atmo-dev/events-ui';
import { render } from 'svelte/server';
import { imageVersion, serveOgImage } from '$lib/server/og/cache';
import { ogFonts } from '$lib/server/og/fonts';
import { buildOgTree, IMAGE_PLACEHOLDERS } from '$lib/server/og/markup';
import { loadThumbnail } from '$lib/server/og/thumbnail';
import type { RequestHandler } from './$types';

function formatDate(dateStr: string, tz: string | undefined): string {
	const weekday = formatInTz(dateStr, tz, { weekday: 'long' });
	const month = formatInTz(dateStr, tz, { month: 'long' });
	const day = partsInTz(dateStr, tz, { day: 'numeric' }).day;
	return `${weekday}, ${month} ${day}`;
}

export const GET: RequestHandler = async ({ params, platform, request, fetch: localFetch }) => {
	const { rkey } = params;
	const did = await getActor(params.actor);
	if (!did || !rkey) throw error(404, 'Event not found');

	let eventData;
	try {
		const client = getServerClient(platform!.env.DB);
		const eventRecord = await getEventRecordFromContrail(client, { did, rkey });
		eventData = eventRecord ? flattenEventRecord(eventRecord) : null;
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
	if (!eventData) throw error(404, 'Event not found');

	const { key, etag } = await imageVersion(did, eventData);
	return serveOgImage({
		env: platform!.env,
		key,
		etag,
		request,
		waitUntil: platform?.ctx ? (promise) => platform.ctx!.waitUntil(promise) : undefined,
		fallback: async () => {
			// Use asset-first delivery, never recurse through the event renderer.
			// Do not forward the event's conditional headers to the static asset.
			const assetRequest = new Request(new URL('/og.png', request.url), {
				method: request.method === 'HEAD' ? 'HEAD' : 'GET'
			});
			const asset = platform?.env.ASSETS
				? await platform.env.ASSETS.fetch(assetRequest)
				: await localFetch(assetRequest);
			if (!asset.ok) throw error(503, 'Preview temporarily unavailable');
			const headers = new Headers(asset.headers);
			// A fallback must never validate as the event image, nor linger for an
			// hour after the budget resets or a concurrent generation finishes.
			headers.delete('etag');
			headers.delete('last-modified');
			headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
			headers.set('X-OG-Fallback', '1');
			return new Response(asset.body, { status: 200, headers });
		},
		render: async () => {
			const dateStr = formatDate(eventData.startsAt, eventData.timezone);
			const images: Record<string, string> = {};
			const media =
				eventData.media?.find((m) => m.role === 'thumbnail') ??
				eventData.media?.find((m) => m.role === 'header');
			if (media?.content) {
				// JPEG, not PNG: PNG thumbnails are several times larger for no visible
				// gain. The blurred backdrop only needs the 128px preset.
				const blob = media.content;
				const [thumbnail, background] = await Promise.all([
					loadThumbnail(getCDNImageBlobUrl({ did, blob, format: 'jpeg' })),
					loadThumbnail(
						getCDNImageBlobUrl({ did, blob, format: 'jpeg', preset: 'avatar_thumbnail' })
					).catch(() => null)
				]);
				images[IMAGE_PLACEHOLDERS.thumbnail] = thumbnail;
				images[IMAGE_PLACEHOLDERS.background] = background ?? thumbnail;
			}
			const hasImage = IMAGE_PLACEHOLDERS.thumbnail in images;
			const { body } = render(EventOgImage, {
				props: {
					name: eventData.name.slice(0, 280),
					dateStr,
					thumbnailUrl: hasImage ? IMAGE_PLACEHOLDERS.thumbnail : null,
					backgroundUrl: hasImage ? IMAGE_PLACEHOLDERS.background : null,
					rkey
				}
			});
			// Consume the stream: generation and persistence must finish BEFORE we
			// serve the response or release the global generation lease.
			return new ImageResponse(buildOgTree(body, images), {
				width: 1200,
				height: 630,
				debug: false,
				format: 'png',
				fonts: ogFonts()
			}).arrayBuffer();
		}
	});
};

// SvelteKit's automatic HEAD would call GET and render a PNG on a cache miss.
export const HEAD: RequestHandler = GET;
