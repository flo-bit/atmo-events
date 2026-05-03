import { marked } from 'marked';
import { sanitize } from '$lib/cal/sanitize';
import { getProfileUrl } from '$lib/atproto/profile-url';
import type { FlatEventRecord } from '$lib/contrail';

export function formatMonth(date: Date): string {
	return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

export function formatDay(date: Date): number {
	return date.getDate();
}

export function formatWeekday(date: Date): string {
	return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function formatFullDate(date: Date): string {
	const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
	if (date.getFullYear() !== new Date().getFullYear()) {
		options.year = 'numeric';
	}
	return date.toLocaleDateString('en-US', options);
}

export function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function getModeLabel(mode: string): string {
	if (mode.includes('virtual')) return 'Virtual';
	if (mode.includes('hybrid')) return 'Hybrid';
	if (mode.includes('inperson')) return 'In-Person';
	return 'Event';
}

/** Foxui accent-color class — applied alongside `variant="primary"` on a Badge
 *  to override its `--accent-*` CSS variables (see @foxui/core/dist/theme.css). */
export function getModeColor(mode: string): string {
	if (mode.includes('virtual')) return 'cyan';
	if (mode.includes('hybrid')) return 'purple';
	if (mode.includes('inperson')) return 'amber';
	return '';
}

export type LocationData = {
	name?: string;
	shortAddress: string;
	fullAddress: string;
	fullString: string;
	googleMapsUrl: string;
};

export function getLocationData(locations: FlatEventRecord['locations']): LocationData | null {
	if (!locations?.length) return null;

	const loc = locations.find((v) => v.$type === 'community.lexicon.location.address') as
		| { name?: string; street?: string; locality?: string; region?: string; country?: string }
		| undefined;
	if (!loc) return null;

	const shortParts = [loc.street, loc.locality].filter(Boolean);
	const fullParts = [loc.street, loc.locality, loc.region, loc.country].filter(Boolean);
	if (fullParts.length === 0) return null;

	const shortAddress = shortParts.join(', ');
	const fullAddress = fullParts.join(', ');
	const displayName = loc.name || undefined;
	const fullString = displayName ? `${displayName}, ${fullAddress}` : fullAddress;
	const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullString)}`;

	return { name: displayName, shortAddress, fullAddress, fullString, googleMapsUrl };
}

export type GeoLocation = {
	lat: number;
	lng: number;
	googleMapsUrl: string;
	osmUrl: string;
};

function geoUrls(lat: number, lng: number, osmType?: string, osmId?: number) {
	return {
		googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
		osmUrl:
			osmType && osmId
				? `https://www.openstreetmap.org/${osmType}/${osmId}`
				: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
	};
}

export async function resolveGeoLocation(
	locations: FlatEventRecord['locations'],
	locationData: LocationData | null
): Promise<GeoLocation | null> {
	if (!locations?.length) return null;

	const geo = locations.find((v) => v.$type === 'community.lexicon.location.geo') as
		| { latitude?: string; longitude?: string }
		| undefined;
	if (geo?.latitude && geo?.longitude) {
		const lat = parseFloat(geo.latitude);
		const lng = parseFloat(geo.longitude);
		if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, ...geoUrls(lat, lng) };
	}

	if (!locationData?.fullAddress) return null;

	try {
		const r = await fetch(`/api/geocoding?q=${encodeURIComponent(locationData.fullAddress)}`);
		if (!r.ok) return null;
		const data = (await r.json()) as {
			lat?: string;
			lon?: string;
			osm_type?: string;
			osm_id?: number;
		} | null;
		if (!data?.lat || !data?.lon) return null;
		const lat = parseFloat(data.lat);
		const lng = parseFloat(data.lon);
		if (isNaN(lat) || isNaN(lng)) return null;
		return { lat, lng, ...geoUrls(lat, lng, data.osm_type, data.osm_id) };
	} catch {
		return null;
	}
}

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) =>
	`<a target="_blank" rel="noopener noreferrer nofollow" href="${href}" class="text-accent-600 dark:text-accent-400 hover:underline">${text}</a>`;

type Facet = {
	index: { byteStart: number; byteEnd: number };
	features: { $type: string; did?: string; uri?: string; tag?: string }[];
};

function renderDescription(text: string, facets?: Facet[]): string {
	let result = text;

	if (facets && facets.length > 0) {
		const encoded = new TextEncoder().encode(text);
		const decoder = new TextDecoder();

		const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

		const parts: string[] = [];
		let cursor = 0;

		for (const facet of sorted) {
			const feature = facet.features?.[0];
			if (!feature) continue;
			if (facet.index.byteStart < cursor) continue;

			const segmentText = decoder.decode(
				encoded.slice(facet.index.byteStart, facet.index.byteEnd)
			);

			let mdLink: string | null = null;
			switch (feature.$type) {
				case 'app.bsky.richtext.facet#mention': {
					const handle = segmentText.startsWith('@') ? segmentText.slice(1) : segmentText;
					mdLink = `[${segmentText}](${getProfileUrl(handle || feature.did || '')})`;
					break;
				}
				case 'app.bsky.richtext.facet#link':
					mdLink = `[${segmentText}](${feature.uri})`;
					break;
				case 'app.bsky.richtext.facet#tag':
					mdLink = `[${segmentText}](https://bsky.app/hashtag/${feature.tag})`;
					break;
			}

			if (mdLink) {
				parts.push(decoder.decode(encoded.slice(cursor, facet.index.byteStart)));
				parts.push(mdLink);
				cursor = facet.index.byteEnd;
			}
		}

		parts.push(decoder.decode(encoded.slice(cursor)));
		result = parts.join('');
	}

	return marked.parse(result, { renderer }) as string;
}

export function buildDescriptionHtml(
	description: string | undefined,
	facets: unknown
): string | null {
	if (!description) return null;
	return sanitize(renderDescription(description, facets as Facet[] | undefined), {
		ADD_ATTR: ['target']
	});
}
