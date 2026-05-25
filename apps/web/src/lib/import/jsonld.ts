import type { EventImportPrefill } from '$lib/import-event';
import { asString, normalizeIso, stripHtml } from './util';

type JsonLdEvent = Record<string, unknown>;

/** Find the first schema.org *Event node embedded in a page's JSON-LD blocks. */
export function extractJsonLdEvent(html: string): JsonLdEvent | null {
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

export function mapJsonLdEvent(
	ev: JsonLdEvent,
	sourceUrl: string
): Omit<EventImportPrefill, 'source'> {
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

function tzFromIso(s: string): string | undefined {
	// IANA tz isn't carried in ISO strings; only an offset is. Picking a zone
	// from offset alone is ambiguous, so we defer guessing until we've assembled
	// the whole prefill (see guessIanaZoneFromIsoOffset in the webpage importer).
	void s;
	return undefined;
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
