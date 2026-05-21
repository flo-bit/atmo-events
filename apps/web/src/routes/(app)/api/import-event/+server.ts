import { json } from '@sveltejs/kit';
import type { EventImportPrefill } from '$lib/import-event';

const FETCH_HEADERS = {
	'User-Agent': 'atmo.rsvp/0.1 (+https://atmo.rsvp)',
	Accept: 'text/html,text/calendar,application/json;q=0.9,*/*;q=0.8'
};

const MAX_BYTES = 2 * 1024 * 1024;
// 3 MB raw cap → ~4 MB base64. Most event cover images are well under this; we
// stash the result in sessionStorage on the client, which has its own limits.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function POST({ request }) {
	let body: { url?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const sourceUrl = body.url?.trim();
	if (!sourceUrl) return json({ error: 'url is required' }, { status: 400 });

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(sourceUrl);
	} catch {
		return json({ error: 'Invalid URL' }, { status: 400 });
	}
	if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
		return json({ error: 'Only http(s) URLs are supported' }, { status: 400 });
	}

	try {
		const result = await importFromUrl(sourceUrl);
		if (!result) {
			return json(
				{ error: 'Could not find event data on that page.' },
				{ status: 422 }
			);
		}
		if (result.imageUrl && !result.imageDataUrl) {
			const image = await fetchImageAsDataUrl(result.imageUrl);
			if (image) result.imageDataUrl = image;
		}
		return json(result);
	} catch (err) {
		console.error('import-event failed:', sourceUrl, err);
		return json({ error: 'Failed to fetch or parse that URL.' }, { status: 502 });
	}
}

async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
	try {
		const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
		if (!res.ok) return undefined;
		const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
		if (!contentType.startsWith('image/')) return undefined;

		const reader = res.body?.getReader();
		if (!reader) {
			const buf = new Uint8Array(await res.arrayBuffer());
			if (buf.byteLength > MAX_IMAGE_BYTES) return undefined;
			return `data:${contentType};base64,${bytesToBase64(buf)}`;
		}
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_IMAGE_BYTES) {
				try {
					await reader.cancel();
				} catch {
					/* ignore */
				}
				return undefined;
			}
			chunks.push(value);
		}
		const merged = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			merged.set(c, off);
			off += c.byteLength;
		}
		return `data:${contentType};base64,${bytesToBase64(merged)}`;
	} catch (err) {
		console.error('fetchImageAsDataUrl failed:', url, err);
		return undefined;
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	// btoa expects a binary string; build in chunks to avoid hitting argument
	// limits with String.fromCharCode on multi-MB buffers.
	let s = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		s += String.fromCharCode.apply(
			null,
			Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
		);
	}
	return btoa(s);
}

async function importFromUrl(url: string): Promise<EventImportPrefill | null> {
	const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
	if (!res.ok) throw new Error(`upstream ${res.status}`);

	const contentType = (res.headers.get('content-type') || '').toLowerCase();
	const text = await readLimited(res, MAX_BYTES);

	const finalUrl = res.url || url;

	if (contentType.includes('text/calendar') || /^BEGIN:VCALENDAR/m.test(text.slice(0, 200))) {
		const ical = parseIcal(text);
		if (ical) return { source: finalUrl, ...ical };
	}

	if (contentType.includes('text/html') || /<html/i.test(text.slice(0, 500))) {
		const jsonLd = extractJsonLdEvent(text);
		const icalLink = findAlternateIcalLink(text, finalUrl);

		// Fetch the linked .ics up front when present: JSON-LD only carries an
		// offset (e.g. -07:00), not an IANA tz name, so we lean on iCal's TZID
		// for that. We still use JSON-LD as the primary source when available
		// because it tends to have cleaner location data.
		let ical: Omit<EventImportPrefill, 'source'> | null = null;
		if (icalLink) {
			try {
				const icalRes = await fetch(icalLink, { headers: FETCH_HEADERS, redirect: 'follow' });
				if (icalRes.ok) {
					const icalText = await readLimited(icalRes, MAX_BYTES);
					ical = parseIcal(icalText);
				}
			} catch {
				/* ignore — JSON-LD or OG will cover for it */
			}
		}

		if (jsonLd) {
			const mapped = mapJsonLdEvent(jsonLd, finalUrl);
			if (!mapped.timezone && ical?.timezone) mapped.timezone = ical.timezone;
			if (!mapped.timezone && mapped.startsAt) {
				mapped.timezone = guessIanaZoneFromIsoOffset(mapped.startsAt);
			}
			return { source: finalUrl, ...mapped };
		}

		if (ical) return { source: finalUrl, ...ical };

		const og = extractOpenGraph(text);
		if (og.title || og.description) {
			return { source: finalUrl, name: og.title, description: og.description, imageUrl: og.image };
		}
	}

	return null;
}

async function readLimited(res: Response, max: number): Promise<string> {
	const reader = res.body?.getReader();
	if (!reader) return await res.text();
	const decoder = new TextDecoder();
	let received = 0;
	let out = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > max) {
			out += decoder.decode(value.subarray(0, Math.max(0, max - (received - value.byteLength))));
			try {
				await reader.cancel();
			} catch {
				/* ignore */
			}
			break;
		}
		out += decoder.decode(value, { stream: true });
	}
	out += decoder.decode();
	return out;
}

/* ---------------- JSON-LD ---------------- */

type JsonLdEvent = Record<string, unknown>;

function extractJsonLdEvent(html: string): JsonLdEvent | null {
	const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	for (const match of html.matchAll(re)) {
		const raw = match[1].trim();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			continue;
		}
		const event = findEventNode(parsed);
		if (event) return event;
	}
	return null;
}

function findEventNode(node: unknown): JsonLdEvent | null {
	if (!node) return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findEventNode(item);
			if (found) return found;
		}
		return null;
	}
	if (typeof node !== 'object') return null;
	const obj = node as Record<string, unknown>;

	const graph = obj['@graph'];
	if (Array.isArray(graph)) {
		const found = findEventNode(graph);
		if (found) return found;
	}

	const type = obj['@type'];
	const types = Array.isArray(type) ? type : type ? [type] : [];
	if (types.some((t) => typeof t === 'string' && /Event$/i.test(t))) {
		return obj;
	}
	return null;
}

function mapJsonLdEvent(ev: JsonLdEvent, sourceUrl: string): Omit<EventImportPrefill, 'source'> {
	const out: Omit<EventImportPrefill, 'source'> = {};

	const name = asString(ev.name);
	if (name) out.name = name;

	const description = stripHtml(asString(ev.description));
	if (description) out.description = description;

	const startDate = asString(ev.startDate);
	if (startDate) {
		out.startsAt = normalizeIso(startDate);
		const tz = tzFromIso(startDate);
		if (tz) out.timezone = tz;
	}
	const endDate = asString(ev.endDate);
	if (endDate) out.endsAt = normalizeIso(endDate);

	const mode = inferModeFromJsonLd(ev);
	if (mode) out.mode = mode;

	const location = extractJsonLdLocation(ev.location);
	if (location.address) out.location = location.address;

	const image = pickFirstImage(ev.image);
	if (image) out.imageUrl = image;

	const links: Array<{ uri: string; name: string }> = [];
	const eventUrl = asString(ev.url);
	if (eventUrl && eventUrl !== sourceUrl) {
		links.push({ uri: eventUrl, name: 'Event page' });
	}
	if (location.virtualUrl) {
		links.push({ uri: location.virtualUrl, name: 'Join link' });
	}
	if (links.length > 0) out.links = links;

	return out;
}

function inferModeFromJsonLd(ev: JsonLdEvent): EventImportPrefill['mode'] | undefined {
	const raw = asString(ev.eventAttendanceMode);
	if (!raw) return undefined;
	const lower = raw.toLowerCase();
	if (lower.includes('mixed')) return 'hybrid';
	if (lower.includes('online')) return 'virtual';
	if (lower.includes('offline')) return 'inperson';
	return undefined;
}

function extractJsonLdLocation(loc: unknown): {
	address?: EventImportPrefill['location'];
	virtualUrl?: string;
} {
	if (!loc) return {};
	if (Array.isArray(loc)) {
		const merged: ReturnType<typeof extractJsonLdLocation> = {};
		for (const item of loc) {
			const part = extractJsonLdLocation(item);
			merged.address ??= part.address;
			merged.virtualUrl ??= part.virtualUrl;
		}
		return merged;
	}
	if (typeof loc !== 'object') return {};
	const obj = loc as Record<string, unknown>;
	const type = asString(obj['@type']);

	if (type && /VirtualLocation/i.test(type)) {
		return { virtualUrl: asString(obj.url) };
	}

	const address = obj.address;
	if (typeof address === 'string') {
		return { address: { street: address } };
	}
	if (address && typeof address === 'object') {
		const a = address as Record<string, unknown>;
		const out: NonNullable<EventImportPrefill['location']> = {};
		const street = asString(a.streetAddress);
		const locality = asString(a.addressLocality);
		const region = asString(a.addressRegion);
		const country = asString(a.addressCountry);
		if (street) out.street = street;
		if (locality) out.locality = locality;
		if (region) out.region = region;
		if (country) out.country = country;
		const placeName = asString(obj.name);
		if (placeName && !out.street) out.street = placeName;
		else if (placeName && out.street && !out.street.includes(placeName)) {
			out.street = `${placeName}, ${out.street}`;
		}
		return { address: Object.keys(out).length > 0 ? out : undefined };
	}

	const placeName = asString(obj.name);
	if (placeName) return { address: { street: placeName } };
	return {};
}

function pickFirstImage(img: unknown): string | undefined {
	if (!img) return undefined;
	if (typeof img === 'string') return img;
	if (Array.isArray(img)) {
		for (const item of img) {
			const v = pickFirstImage(item);
			if (v) return v;
		}
		return undefined;
	}
	if (typeof img === 'object') {
		const obj = img as Record<string, unknown>;
		return asString(obj.url) ?? asString(obj.contentUrl);
	}
	return undefined;
}

/* ---------------- iCal ---------------- */

type IcalEvent = Omit<EventImportPrefill, 'source'>;

function parseIcal(text: string): IcalEvent | null {
	const unfolded = text.replace(/\r?\n[ \t]/g, '');
	const lines = unfolded.split(/\r?\n/);

	let inEvent = false;
	const fields: Record<string, { params: Record<string, string>; value: string }> = {};

	for (const raw of lines) {
		if (raw === 'BEGIN:VEVENT') {
			inEvent = true;
			continue;
		}
		if (raw === 'END:VEVENT') break;
		if (!inEvent) continue;

		const colonIdx = raw.indexOf(':');
		if (colonIdx < 0) continue;
		const left = raw.slice(0, colonIdx);
		const value = raw.slice(colonIdx + 1);
		const parts = left.split(';');
		const name = parts[0].toUpperCase();
		const params: Record<string, string> = {};
		for (let i = 1; i < parts.length; i++) {
			const eq = parts[i].indexOf('=');
			if (eq > 0) {
				params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
			}
		}
		fields[name] = { params, value };
	}

	if (Object.keys(fields).length === 0) return null;

	const out: IcalEvent = {};
	const summary = fields.SUMMARY?.value;
	if (summary) out.name = unescapeIcal(summary);
	const description = fields.DESCRIPTION?.value;
	if (description) out.description = unescapeIcal(description);
	const url = fields.URL?.value;
	if (url) out.links = [{ uri: url, name: 'Event page' }];

	const start = fields.DTSTART;
	if (start) {
		const iso = icalDateToIso(start.value, start.params.TZID);
		if (iso) out.startsAt = iso;
		if (start.params.TZID) out.timezone = start.params.TZID;
	}
	const end = fields.DTEND;
	if (end) {
		const iso = icalDateToIso(end.value, end.params.TZID);
		if (iso) out.endsAt = iso;
	}

	const location = fields.LOCATION?.value;
	if (location) {
		out.location = { street: unescapeIcal(location) };
	}

	return out;
}

function unescapeIcal(s: string): string {
	return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function icalDateToIso(value: string, tzid?: string): string | undefined {
	// All-day: YYYYMMDD
	const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (dateOnly) {
		return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00`;
	}
	// UTC: YYYYMMDDTHHMMSSZ
	const utc = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (utc) {
		return `${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`;
	}
	// Local: YYYYMMDDTHHMMSS (interpret in TZID if present)
	const local = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
	if (local) {
		const base = `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6]}`;
		if (!tzid) return base;
		// Compute offset for that wall time in tzid.
		const offset = offsetForZone(tzid, base);
		return offset ? `${base}${offset}` : base;
	}
	return undefined;
}

function offsetForZone(tz: string, isoNoOffset: string): string | undefined {
	try {
		const ms = Date.parse(isoNoOffset + 'Z');
		if (Number.isNaN(ms)) return undefined;
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			timeZoneName: 'shortOffset',
			hour: '2-digit'
		});
		const parts = dtf.formatToParts(new Date(ms));
		const name = parts.find((p) => p.type === 'timeZoneName')?.value;
		const m = name?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
		if (!m) return undefined;
		const hours = parseInt(m[1], 10);
		const mins = m[2] ? parseInt(m[2], 10) : 0;
		const sign = hours >= 0 ? '+' : '-';
		const hh = String(Math.abs(hours)).padStart(2, '0');
		const mm = String(mins).padStart(2, '0');
		return `${sign}${hh}:${mm}`;
	} catch {
		return undefined;
	}
}

function findAlternateIcalLink(html: string, baseUrl: string): string | null {
	// Prefer the canonical <link rel="alternate" type="text/calendar"> tag.
	const linkRe = /<link\b([^>]+)>/gi;
	for (const m of html.matchAll(linkRe)) {
		const attrs = m[1];
		if (!/type=["']text\/calendar["']/i.test(attrs)) continue;
		const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
		if (!href) continue;
		try {
			return new URL(href, baseUrl).toString();
		} catch {
			continue;
		}
	}

	// Fall back to any anchor pointing at a .ics file or a calendar-export
	// endpoint. Partiful, for instance, only exposes its calendar feed this way.
	const anchorRe = /href=["']([^"']+\.ics(?:\?[^"']*)?)["']/gi;
	for (const m of html.matchAll(anchorRe)) {
		try {
			return new URL(m[1], baseUrl).toString();
		} catch {
			continue;
		}
	}
	const calendarRe = /href=["']([^"']*(?:add[-_]?to[-_]?calendar|\/calendar|\/ics|export\.ics)[^"']*)["']/gi;
	for (const m of html.matchAll(calendarRe)) {
		try {
			return new URL(m[1], baseUrl).toString();
		} catch {
			continue;
		}
	}
	return null;
}

/* ---------------- OpenGraph ---------------- */

function extractOpenGraph(html: string): { title?: string; description?: string; image?: string } {
	const grab = (prop: string) => {
		const re = new RegExp(
			`<meta\\b[^>]*?(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`,
			'i'
		);
		const alt = new RegExp(
			`<meta\\b[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${prop}["']`,
			'i'
		);
		return html.match(re)?.[1] ?? html.match(alt)?.[1];
	};
	return {
		title: grab('og:title') ?? grab('twitter:title'),
		description: grab('og:description') ?? grab('twitter:description') ?? grab('description'),
		image: grab('og:image') ?? grab('twitter:image')
	};
}

/* ---------------- helpers ---------------- */

function asString(v: unknown): string | undefined {
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function stripHtml(s: string | undefined): string | undefined {
	if (!s) return undefined;
	return s
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function normalizeIso(s: string): string {
	// Date.parse handles most ISO variants; re-emit canonical form when we can.
	const ms = Date.parse(s);
	if (Number.isNaN(ms)) return s;
	// Preserve the original offset when present (Date.parse → toISOString gives UTC).
	if (/[+-]\d{2}:?\d{2}$|Z$/.test(s)) return s;
	return new Date(ms).toISOString();
}

function tzFromIso(s: string): string | undefined {
	// IANA tz isn't carried in ISO strings; only an offset is. Picking a zone
	// from offset alone is ambiguous, so we defer guessing until we've assembled
	// the whole prefill (see guessIanaZoneFromIsoOffset).
	void s;
	return undefined;
}

/**
 * Curated list of representative IANA zones we'll consider when guessing from
 * an ISO offset. Ordering matters — earlier entries win ties, so the most
 * commonly-meant zone for each offset bucket should come first.
 */
const ZONE_CANDIDATES = [
	'Pacific/Honolulu',
	'America/Anchorage',
	'America/Los_Angeles',
	'America/Denver',
	'America/Phoenix',
	'America/Chicago',
	'America/Mexico_City',
	'America/New_York',
	'America/Toronto',
	'America/Halifax',
	'America/Sao_Paulo',
	'America/Argentina/Buenos_Aires',
	'Atlantic/Azores',
	'UTC',
	'Europe/London',
	'Europe/Berlin',
	'Europe/Paris',
	'Europe/Madrid',
	'Africa/Cairo',
	'Europe/Athens',
	'Europe/Moscow',
	'Asia/Dubai',
	'Asia/Karachi',
	'Asia/Kolkata',
	'Asia/Dhaka',
	'Asia/Bangkok',
	'Asia/Singapore',
	'Asia/Shanghai',
	'Asia/Tokyo',
	'Australia/Sydney',
	'Pacific/Auckland'
];

function guessIanaZoneFromIsoOffset(iso: string): string | undefined {
	const m = iso.match(/([+-]\d{2}):?(\d{2})$|Z$/);
	if (!m) return undefined;
	const offsetMinutes = iso.endsWith('Z')
		? 0
		: (m[1].startsWith('-') ? -1 : 1) * (parseInt(m[1].slice(1), 10) * 60 + parseInt(m[2], 10));

	// Offset 0 is almost always a platform serializing as UTC because it didn't
	// track the authoring tz (Partiful does this). Returning "UTC" here would be
	// wrong far more often than right — leave it unset so the editor falls back
	// to the viewer's browser zone and they can correct it.
	if (offsetMinutes === 0) return undefined;

	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return undefined;

	for (const zone of ZONE_CANDIDATES) {
		if (zoneOffsetAt(zone, ms) === offsetMinutes) return zone;
	}
	return undefined;
}

function zoneOffsetAt(zone: string, ms: number): number | undefined {
	try {
		// Format the same instant as wall-clock parts in `zone`, reconstruct it
		// as if it were UTC, and the difference is the zone's offset at `ms`.
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
		const parts = Object.fromEntries(
			dtf.formatToParts(new Date(ms)).map((p) => [p.type, p.value])
		) as Record<string, string>;
		const asUtcMs = Date.UTC(
			Number(parts.year),
			Number(parts.month) - 1,
			Number(parts.day),
			Number(parts.hour) === 24 ? 0 : Number(parts.hour),
			Number(parts.minute),
			Number(parts.second)
		);
		return Math.round((asUtcMs - ms) / 60000);
	} catch {
		return undefined;
	}
}
