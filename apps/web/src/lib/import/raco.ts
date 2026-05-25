import type { EventImportPrefill } from '$lib/import-event';
import type { EventImporter } from './types';
import { FETCH_HEADERS } from './http';
import { offsetForZone } from './util';

/**
 * Importer for Resident Advisor (ra.co). Its event *pages* sit behind DataDome
 * bot protection, so fetching the HTML just yields a captcha stub (no
 * JSON-LD/OG/ics). Its GraphQL API is open, though, and carries cleaner data —
 * so this importer matches on the URL and talks to GraphQL directly, never
 * touching ctx.getPage().
 */
export const racoImporter: EventImporter = {
	name: 'raco',
	accept(ctx) {
		return matchRaCoEvent(ctx.url) !== null;
	},
	async parseData(ctx) {
		const match = matchRaCoEvent(ctx.url);
		if (!match) return null;
		return importFromRaCo(match.id, match.canonicalUrl);
	}
};

const RACO_GRAPHQL_URL = 'https://ra.co/graphql';
const RACO_EVENT_QUERY = `query GET_EVENT_DETAIL($id: ID!) {
	event(id: $id) {
		id
		title
		content
		startTime
		endTime
		flyerFront
		flyerBack
		venue {
			name
			address
			area {
				name
				ianaTimeZone
				country { name }
			}
		}
		artists { name }
		images { filename type }
	}
}`;

type RaCoEvent = {
	id?: string;
	title?: string;
	content?: string;
	startTime?: string;
	endTime?: string;
	flyerFront?: string | null;
	flyerBack?: string | null;
	venue?: {
		name?: string;
		address?: string;
		area?: {
			name?: string;
			ianaTimeZone?: string;
			country?: { name?: string } | null;
		} | null;
	} | null;
	artists?: Array<{ name?: string } | null> | null;
	images?: Array<{ filename?: string; type?: string } | null> | null;
};

function matchRaCoEvent(rawUrl: string): { id: string; canonicalUrl: string } | null {
	let u: URL;
	try {
		u = new URL(rawUrl);
	} catch {
		return null;
	}
	if (u.hostname.toLowerCase().replace(/^www\./, '') !== 'ra.co') return null;
	const m = u.pathname.match(/^\/events\/(\d+)/);
	if (!m) return null;
	return { id: m[1], canonicalUrl: `https://ra.co/events/${m[1]}` };
}

async function importFromRaCo(id: string, sourceUrl: string): Promise<EventImportPrefill | null> {
	const res = await fetch(RACO_GRAPHQL_URL, {
		method: 'POST',
		headers: {
			'User-Agent': FETCH_HEADERS['User-Agent'],
			'Content-Type': 'application/json',
			Accept: 'application/json',
			// ra.co keys content language off this header; without it the API
			// returns localized strings based on the (server) IP geo.
			'ra-content-language': 'en',
			Referer: sourceUrl,
			Origin: 'https://ra.co'
		},
		body: JSON.stringify({
			operationName: 'GET_EVENT_DETAIL',
			variables: { id },
			query: RACO_EVENT_QUERY
		})
	});
	if (!res.ok) throw new Error(`ra.co graphql ${res.status}`);
	const payload = (await res.json().catch(() => null)) as {
		data?: { event?: RaCoEvent | null };
	} | null;
	const ev = payload?.data?.event;
	if (!ev || !ev.title) return null;
	return mapRaCoEvent(ev, sourceUrl);
}

function mapRaCoEvent(ev: RaCoEvent, sourceUrl: string): EventImportPrefill {
	// ra.co events are physical club/festival dates.
	const out: EventImportPrefill = { source: sourceUrl, mode: 'inperson' };

	if (ev.title) out.name = ev.title;

	const tz = ev.venue?.area?.ianaTimeZone || undefined;
	if (tz) out.timezone = tz;
	if (ev.startTime) out.startsAt = raCoLocalToIso(ev.startTime, tz);
	if (ev.endTime) out.endsAt = raCoLocalToIso(ev.endTime, tz);

	// Description is plain text; tack on the lineup since that's the heart of an
	// RA listing and the API keeps it structured rather than in the body.
	const parts: string[] = [];
	const content = ev.content?.trim();
	if (content) parts.push(content);
	const lineup = (ev.artists ?? []).map((a) => a?.name?.trim()).filter((n): n is string => !!n);
	if (lineup.length) parts.push(`Lineup: ${lineup.join(', ')}`);
	if (parts.length) out.description = parts.join('\n\n');

	const venue = ev.venue;
	if (venue) {
		const loc: NonNullable<EventImportPrefill['location']> = {};
		const name = venue.name?.trim();
		const address = venue.address?.trim();
		if (name && address) loc.street = `${name}, ${address}`;
		else if (name) loc.street = name;
		else if (address) loc.street = address;
		const locality = venue.area?.name?.trim();
		if (locality) loc.locality = locality;
		const country = venue.area?.country?.name?.trim();
		if (country) loc.country = country;
		if (Object.keys(loc).length) out.location = loc;
	}

	const image = pickRaCoImage(ev);
	if (image) out.imageUrl = image;

	return out;
}

function pickRaCoImage(ev: RaCoEvent): string | undefined {
	const images = (ev.images ?? []).filter(
		(i): i is { filename: string; type?: string } => !!i?.filename
	);
	const front = images.find((i) => (i.type || '').toUpperCase() === 'FLYERFRONT');
	return front?.filename ?? images[0]?.filename ?? ev.flyerFront ?? ev.flyerBack ?? undefined;
}

function raCoLocalToIso(value: string, tz?: string): string {
	// ra.co serves naive venue wall-time, e.g. "2026-06-06T23:59:00.000".
	const base = value.replace(/\.\d+$/, '').replace(/Z$/, '');
	if (!tz) return base;
	const offset = offsetForZone(tz, base);
	return offset ? `${base}${offset}` : base;
}
