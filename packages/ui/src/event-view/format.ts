import { marked } from 'marked';
import { sanitize } from '../cal/sanitize.js';
import { getProfileUrl } from '../profile-url.js';
import { dropRepeats, formatPoint, locationSummary } from '../location-summary.js';
import { coordsUsableForDisplay } from '../editor/location.js';
import type { FlatEventRecord } from '../contrail.js';

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

/** The `lat,lng` a Google Maps query should use, or '' when the stored point is not
 *  safe to point at. Coordinates beat address text for resolution: text is geocoded
 *  by Google afresh, and an address whose fields the record kept out of order ("a
 *  city, then a street") resolves to the wrong feature — a Copenhagen record aimed
 *  at the city square landed on the train station of the same name. */
function mapQueryPoint(lat: string | undefined, lng: string | undefined): string {
	if (!lat?.trim() || !lng?.trim()) return '';
	const latitude = Number(lat);
	const longitude = Number(lng);
	return coordsUsableForDisplay(latitude, longitude) ? `${latitude},${longitude}` : '';
}

export type LocationData = {
	name?: string;
	shortAddress: string;
	fullAddress: string;
	fullString: string;
	/** Every address field in address order, repeats and all — for GEOCODING, not for
	 *  display. The displayed strings drop what the name already states, and that is
	 *  the wrong input for a geocoder: a venue named after its city ("Copenhagen")
	 *  suppresses the locality, throwing away the token that disambiguates the
	 *  street. Empty when there are no address fields. */
	geocodeQuery: string;
	googleMapsUrl: string;
};

export function getLocationData(locations: FlatEventRecord['locations']): LocationData | null {
	const summary = locationSummary(locations);
	if (!summary) return null;

	const fullParts = [summary.street, summary.locality, summary.region, summary.country].filter(
		Boolean
	);
	// No address fields — a place saved as a geo entry alone. Show its name, or the
	// point itself when it has none, which is what the editor shows for the same
	// record. Returning null here would render no location and no map for a record
	// that does have a position.
	if (fullParts.length === 0) {
		// Query the point only once it is safe to point at — the raw lexicon strings are
		// whatever another client wrote, and a named record must not smuggle a bad point
		// into the map link just because the name kept the label non-empty.
		const displayPoint = formatPoint(summary.lat, summary.lng);
		const point = mapQueryPoint(summary.lat, summary.lng);
		const label = summary.name || displayPoint;
		if (!label) return null;
		// The text fallback is the NAME, never `label` — `label` may be the formatted
		// point, and querying that is the same bad link by another route: a point this
		// module refused to pin is not a point it may search for either. The two guards
		// agree today, so this is belt-and-braces; it stops them from disagreeing
		// silently if the display bound is ever loosened.
		const query = point || summary.name;
		if (!query) return null;
		return {
			name: summary.name,
			shortAddress: '',
			fullAddress: '',
			geocodeQuery: '',
			fullString: label,
			googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
		};
	}

	// Drop what something already shown states, exactly as locationShortLabel does —
	// this page lays the fields out separately, so it needs the positional form. Two
	// repetitions to catch: a name that IS its own street (a named flight of steps,
	// a plaza — the picker keeps those names on purpose), which would otherwise
	// render "Rocky Steps, Rocky Steps, Philadelphia"; and fields restating each
	// other, which in a city-state gave "Berlin, Berlin, Berlin, DE".
	const [street, locality, region, country] = dropRepeats(summary.name, [
		summary.street,
		summary.locality,
		summary.region,
		summary.country
	]);
	const shortAddress = [street, locality].filter(Boolean).join(', ');
	const fullAddress = [street, locality, region, country].filter(Boolean).join(', ');
	const fullString = [summary.name, fullAddress].filter(Boolean).join(', ');
	// The point when we have one, the address text only as the fallback. Text is
	// re-geocoded by Google and can land on a different feature of the same name.
	const point = mapQueryPoint(summary.lat, summary.lng);
	const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point || fullString)}`;

	return {
		name: summary.name,
		shortAddress,
		fullAddress,
		geocodeQuery: fullParts.join(', '),
		fullString,
		googleMapsUrl
	};
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
		// Same bound the writers and the other readers use, plus the 0,0 sentinel. A
		// record carrying it has a real address in its other fields, so falling through
		// to geocode that beats pinning the map in the Gulf of Guinea.
		if (coordsUsableForDisplay(lat, lng)) return { lat, lng, ...geoUrls(lat, lng) };
		// ...but only fall through when there is address text to geocode INSTEAD.
		// /api/geocoding is uncached, so every pageview of a sentinel-only record
		// would otherwise fire a fresh upstream geocode for a query that cannot
		// resolve to anything better. Before this PR these records returned here
		// with zero network work; a bare `return null` keeps that.
		if (!locationData?.geocodeQuery && !locationData?.fullAddress) return null;
	}

	// The un-de-duplicated query, so a venue named after its own city still geocodes
	// with the city attached.
	const query = locationData?.geocodeQuery || locationData?.fullAddress;
	if (!query) return null;

	try {
		const r = await fetch(`/api/geocoding?q=${encodeURIComponent(query)}`);
		if (!r.ok) return null;
		// /api/geocoding returns a normalized { lat, lng, label, ... } shape.
		const data = (await r.json()) as {
			lat?: number;
			lng?: number;
			osmType?: string;
			osmId?: number;
		} | null;
		if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return null;
		const lat = data.lat;
		const lng = data.lng;
		if (isNaN(lat) || isNaN(lng)) return null;
		return { lat, lng, ...geoUrls(lat, lng, data.osmType, data.osmId) };
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
