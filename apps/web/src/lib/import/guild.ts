import { FETCH_HEADERS, fetchImageAsDataUrl } from './http';
import type { EventImporter } from './types';
import * as v from 'valibot';

const GUILD_API_BASE = 'https://guild.host/api/next';
const GUILD_EVENT_REGEX = /^\/events\/([^/]+)/;

const GuildEventSchema = v.object({
	slug: v.string(),
	fullUrl: v.pipe(v.string(), v.url()),
	name: v.string(),
	description: v.optional(v.string()),
	startAt: v.string(),
	endAt: v.string(),
	timeZone: v.string(),
	hasVenue: v.boolean(),
	hasExternalUrl: v.boolean(),
	createdAt: v.pipe(v.string(), v.toDate()),
	uploadedSocialCard: v.optional(
		v.object({
			url: v.pipe(v.string(), v.url())
		})
	),
	generatedSocialCardURL: v.pipe(v.string(), v.url())
});

function extractGuildEventSlug(rawUrl: string) {
	const url = URL.parse(rawUrl);
	if (!url || (url.hostname !== 'guild.host' && url.hostname !== 'www.guild.host')) return null;
	const m = url.pathname.match(GUILD_EVENT_REGEX);
	if (!m) return null;
	return m[1];
}

/**
 * Importer for Guild (guild.host). Events are fetched via the Guild API
 * at https://guild.host/api/next/events/<slug>.
 *
 * Note: The Guild API does not expose venue/location data. If the user wants
 * to accept RSVPs on atmo, they will need to add the location manually after
 * import.
 */
export const guildImporter: EventImporter = {
	name: 'guild',
	accept(ctx) {
		return !!extractGuildEventSlug(ctx.url);
	},
	async parseData(ctx) {
		const slug = extractGuildEventSlug(ctx.url);
		if (!slug) return null;

		const res = await fetch(`${GUILD_API_BASE}/events/${slug}`, {
			headers: {
				...FETCH_HEADERS,
				Accept: 'application/json'
			}
		});

		if (!res.ok) {
			throw new Error('failed to fetch guild event', { cause: res });
		}

		const data = v.parse(GuildEventSchema, await res.json());

		return {
			source: data.fullUrl,
			name: data.name,
			description: data.description,
			timezone: data.timeZone,
			startsAt: data.startAt,
			endsAt: data.endAt,
			imageDataUrl: await fetchImageAsDataUrl(
				data.uploadedSocialCard?.url ?? data.generatedSocialCardURL
			),
			links: [{ uri: data.fullUrl, name: 'Event page' }],
			mode:
				data.hasExternalUrl && data.hasVenue
					? 'hybrid'
					: data.hasExternalUrl
						? 'virtual'
						: 'inperson'
		};
	}
};
