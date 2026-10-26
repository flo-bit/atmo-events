import * as v from 'valibot';
import type { EventImportPrefill } from '$lib/import-event';
import type { EventImporter } from './types';
import { FETCH_HEADERS, MAX_BYTES, readLimited, UpstreamHttpError } from './http';
import { stripHtml } from './util';

const LUMA_API = 'https://api2.luma.com/event/get';

const LumaEventSchema = v.object({
	event: v.object({
		name: v.string(),
		url: v.string(),
		start_at: v.string(),
		end_at: v.nullish(v.string()),
		timezone: v.string(),
		cover_url: v.nullish(v.string()),
		location_type: v.optional(v.string()),
		geo_address_info: v.nullish(
			v.object({
				address: v.optional(v.string()),
				city: v.optional(v.string()),
				region: v.optional(v.string()),
				country: v.optional(v.string()),
				country_code: v.optional(v.string())
			})
		)
	}),
	description_mirror: v.optional(v.unknown())
});

function eventSlug(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		if (!['luma.com', 'www.luma.com', 'lu.ma', 'www.lu.ma'].includes(url.hostname)) return null;
		const match = url.pathname.match(/^\/([^/]+)\/?$/);
		if (!match || /\.ics$/i.test(match[1])) return null;
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}

/**
 * Use the public JSON endpoint used by Luma's website, not its HTML event page.
 * The latter returns 429 for Workers egress even when this endpoint succeeds.
 * It accepts both custom slugs and evt-* IDs, including legacy lu.ma links.
 */
export const lumaImporter: EventImporter = {
	name: 'luma',
	accept(ctx) {
		return eventSlug(ctx.url) !== null;
	},
	async parseData(ctx) {
		const slug = eventSlug(ctx.url);
		if (!slug) return null;
		const apiUrl = new URL(LUMA_API);
		apiUrl.searchParams.set('event_api_id', slug);
		const res = await fetch(apiUrl.toString(), {
			headers: { ...FETCH_HEADERS, Accept: 'application/json' }
		});
		if (!res.ok) throw new UpstreamHttpError(apiUrl.toString(), res);

		const data = v.parse(LumaEventSchema, JSON.parse(await readLimited(res, MAX_BYTES)));
		const event = data.event;
		const address = event.geo_address_info;
		const location: EventImportPrefill['location'] = address
			? {
					street: address.address,
					locality: address.city,
					region: address.region,
					country: address.country_code ?? address.country
				}
			: undefined;

		return {
			source: new URL(event.url, 'https://luma.com/').toString(),
			name: event.name,
			description:
				descriptionText(data.description_mirror)
					.replace(/\n{3,}/g, '\n\n')
					.trim() || undefined,
			startsAt: event.start_at,
			endsAt: event.end_at ?? undefined,
			timezone: event.timezone,
			imageUrl: event.cover_url ?? undefined,
			mode:
				event.location_type === 'online'
					? 'virtual'
					: event.location_type === 'offline'
						? 'inperson'
						: event.location_type === 'hybrid'
							? 'hybrid'
							: undefined,
			location
		};
	}
};

/** Flatten Luma's ProseMirror document without dropping paragraph/line breaks. */
function descriptionText(node: unknown, depth = 0): string {
	if (depth > 30 || !node) return '';
	if (typeof node === 'string') return stripHtml(node) ?? '';
	if (typeof node !== 'object') return '';
	const obj = node as Record<string, unknown>;
	if (obj.type === 'text' && typeof obj.text === 'string') return obj.text;
	if (obj.type === 'hard_break' || obj.type === 'hardBreak') return '\n';
	const text = Array.isArray(obj.content)
		? obj.content.map((child) => descriptionText(child, depth + 1)).join('')
		: '';
	return obj.type === 'paragraph' || obj.type === 'heading' ? `${text}\n\n` : text;
}
