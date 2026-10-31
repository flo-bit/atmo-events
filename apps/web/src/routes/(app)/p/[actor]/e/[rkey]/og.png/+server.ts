import { env, waitUntil } from 'cloudflare:workers';
import { getCDNImageBlobUrl } from '@svelte-atproto/oauth/bsky';
import { error } from '@sveltejs/kit';
import EventOgImage from './EventOgImage.svelte';
import Avatar from './avatars';
import { getActor } from '#lib/actor.js';
import { flattenEventRecord, getEventRecordFromContrail } from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
import { formatInTz, partsInTz, getEventThumbnail } from '@atmo-dev/events-ui';
import { render } from 'svelte/server';
import { imageVersion, serveOgImage } from '#lib/server/og/cache.js';
import { IMAGE_PLACEHOLDERS, withOgRenderer } from '#lib/server/og/takumi.js';
import { loadThumbnail } from '#lib/server/og/thumbnail.js';
import type { RequestHandler } from './$types';

const CARD = { width: 1200, height: 630 };
// The avatar is mostly SVG blur, which costs ~10x more at card size. Rasterize
// it small once and let the card stretch it; blurred shapes upscale invisibly.
const AVATAR_PX = 128;
const AVATAR_COLORS = ['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90'];

function formatDate(dateStr: string, tz: string | undefined): string {
	const weekday = formatInTz(dateStr, tz, { weekday: 'long' });
	const month = formatInTz(dateStr, tz, { month: 'long' });
	const day = partsInTz(dateStr, tz, { day: 'numeric' }).day;
	return `${weekday}, ${month} ${day}`;
}

export const GET: RequestHandler = async ({ params, request, fetch: localFetch }) => {
	const { rkey } = params;
	const did = await getActor(params.actor);
	if (!did || !rkey) throw error(404, 'Event not found');

	let eventData;
	try {
		const client = getServerClient(env.DB);
		const eventRecord = await getEventRecordFromContrail(client, { did, rkey });
		eventData = eventRecord ? flattenEventRecord(eventRecord) : null;
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
	if (!eventData) throw error(404, 'Event not found');

	const { key, etag } = await imageVersion(did, eventData);
	return serveOgImage({
		env: env,
		key,
		etag,
		request,
		waitUntil: waitUntil,
		fallback: async () => {
			// Use asset-first delivery, never recurse through the event renderer.
			// Do not forward the event's conditional headers to the static asset.
			const assetRequest = new Request(new URL('/og.png', request.url), {
				method: request.method === 'HEAD' ? 'HEAD' : 'GET'
			});
			const asset = env.ASSETS
				? await env.ASSETS.fetch(assetRequest)
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
			const media =
				getEventThumbnail(eventData.media) ?? eventData.media?.find((m) => m.role === 'header');
			// Keep Takumi's JPEG fast path; the library CDN helper defaults to WebP.
			// The blurred backdrop only needs the 128px preset.
			const photo = media?.content
				? await Promise.all([
						loadThumbnail(
							getCDNImageBlobUrl({ did, blob: media.content }).replace(/@webp$/, '@jpeg')
						),
						loadThumbnail(
							getCDNImageBlobUrl({
								did,
								blob: media.content,
								preset: 'avatar_thumbnail'
							}).replace(/@webp$/, '@jpeg')
						).catch(() => null)
					])
				: null;
			const png = await withOgRenderer(async (renderer) => {
				let images: Record<string, Uint8Array>;
				if (photo) {
					const [card, background] = photo;
					images = {
						[IMAGE_PLACEHOLDERS.card]: card,
						[IMAGE_PLACEHOLDERS.background]: background ?? card
					};
				} else {
					const svg = render(Avatar, {
						props: {
							size: AVATAR_PX,
							name: rkey,
							variant: 'marble',
							colors: AVATAR_COLORS,
							square: true
						}
					}).body.replace(/<!--.*?-->/g, '');
					const avatar = await renderer.renderHtml(
						`<img src="${IMAGE_PLACEHOLDERS.avatar}" style="width:${AVATAR_PX}px;height:${AVATAR_PX}px" />`,
						{ width: AVATAR_PX, height: AVATAR_PX },
						{ [IMAGE_PLACEHOLDERS.avatar]: new TextEncoder().encode(svg) }
					);
					images = { [IMAGE_PLACEHOLDERS.card]: avatar, [IMAGE_PLACEHOLDERS.background]: avatar };
				}
				const { body } = render(EventOgImage, {
					props: {
						name: eventData.name.slice(0, 280),
						dateStr,
						cardImage: IMAGE_PLACEHOLDERS.card,
						backgroundImage: IMAGE_PLACEHOLDERS.background,
						blurBackground: Boolean(photo)
					}
				});
				return renderer.renderHtml(body, CARD, images);
			});
			// Rendering and persistence finish BEFORE we serve the response or
			// release the global generation lease.
			return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
		}
	});
};

// SvelteKit's automatic HEAD would call GET and render a PNG on a cache miss.
export const HEAD: RequestHandler = GET;
