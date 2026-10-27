import type { EventLocationVariant } from '../event-types.js';

export type Coordinates = { lat: number; lng: number };
export type LocationData = {
	kind: 'address' | 'geo' | 'fsq' | 'hthree' | 'place' | 'uri';
	name?: string;
	label: string;
	detail?: string;
	href?: string;
	/** Compact label for event cards; addresses keep the existing city-only treatment. */
	summary?: string;
	coordinates?: Coordinates;
	h3Cell?: string;
	/** Only street addresses may be sent to the geocoder. */
	geocodeQuery?: string;
};

function text(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function coordinates(record: Record<string, unknown>): Coordinates | undefined {
	const latitude = text(record, 'latitude');
	const longitude = text(record, 'longitude');
	const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
	if (!latitude || !longitude || !decimal.test(latitude) || !decimal.test(longitude)) return;
	const lat = Number(latitude);
	const lng = Number(longitude);
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
		return;
	return { lat, lng };
}

function coordinateLabel({ lat, lng }: Coordinates): string {
	return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function mapsUrl(query: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function webUrl(uri: string): string | undefined {
	try {
		const url = new URL(uri);
		if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
	} catch {}
	return undefined;
}

function formatLocation(value: unknown): LocationData | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	const name = text(record, 'name');
	switch (record.$type) {
		case 'community.lexicon.location.address': {
			const locality = text(record, 'locality');
			const street = text(record, 'street');
			const address = [
				street,
				locality,
				text(record, 'region'),
				text(record, 'postalCode'),
				text(record, 'country')
			]
				.filter(Boolean)
				.join(', ');
			const label = name ?? address;
			if (!label) return null;
			const fullString = name && address && name !== address ? `${name}, ${address}` : label;
			return {
				kind: 'address',
				name,
				label,
				detail: name && address !== name ? address || undefined : undefined,
				href: mapsUrl(fullString),
				summary: locality ?? name ?? street,
				geocodeQuery: fullString
			};
		}
		case 'community.lexicon.location.geo': {
			const point = coordinates(record);
			if (!point) return null;
			const coords = coordinateLabel(point);
			return {
				kind: 'geo',
				name,
				label: name ?? coords,
				detail: name ? coords : undefined,
				href: mapsUrl(`${point.lat},${point.lng}`),
				summary: name ?? coords,
				coordinates: point
			};
		}
		case 'community.lexicon.location.fsq': {
			const id = text(record, 'fsq_place_id');
			if (!id) return null;
			return {
				kind: 'fsq',
				name,
				label: name ?? `Foursquare: ${id}`,
				href: `https://foursquare.com/v/${encodeURIComponent(id)}`,
				summary: name ?? `Foursquare: ${id}`,
				coordinates: coordinates(record)
			};
		}
		case 'community.lexicon.location.hthree': {
			const cell = text(record, 'value');
			if (!cell) return null;
			return {
				kind: 'hthree',
				name,
				label: name ?? `H3: ${cell}`,
				detail: name ? `H3: ${cell}` : undefined,
				summary: name ?? `H3: ${cell}`,
				h3Cell: cell
			};
		}
		case 'community.lexicon.calendar.event#uri': {
			const uri = text(record, 'uri');
			if (!uri) return null;
			// AT references describe a place, not a user-facing link. Without a
			// supplied name there is nothing useful to show until it is resolved.
			if (uri.startsWith('at://')) {
				return name ? { kind: 'place', name, label: name, summary: name } : null;
			}
			return {
				kind: 'uri',
				label: name ?? uri,
				detail: name && name !== uri ? uri : undefined,
				href: webUrl(uri),
				summary: name ?? uri
			};
		}
		default:
			return null;
	}
}

/** Preserve record order and every supported location, including unnamed variants. */
export function getLocations(locations: EventLocationVariant[] | undefined): LocationData[] {
	if (!Array.isArray(locations)) return [];
	return locations.map(formatLocation).filter((location) => location !== null);
}

export type LocationLine = { label: string; href?: string; muted: boolean };

/** One pin for the place: venue names above addresses, coordinates only as a fallback. */
export function getPhysicalLocationLines(locations: LocationData[]): LocationLine[] {
	const physical = locations.filter((location) => location.kind !== 'uri');
	const names = physical.filter((location) => location.name);
	const mapHref =
		physical.find((location) => location.kind === 'address')?.href ??
		physical.find((location) => location.coordinates)?.href;
	const lines: LocationLine[] = names.map((location) => ({
		label: location.name!,
		href: location.href ?? (location.kind === 'place' ? mapHref : undefined),
		muted: false
	}));
	const hasDescription =
		names.length > 0 ||
		locations.some((location) => location.kind !== 'geo' && location.kind !== 'hthree');
	const hasAddress = physical.some((location) => location.kind === 'address');
	for (const location of physical) {
		if (location.kind === 'address') {
			const label = location.name ? location.detail : location.label;
			if (label) lines.push({ label, href: location.href, muted: names.length > 0 });
		} else if (location.kind === 'fsq' && !location.name && !hasAddress) {
			lines.push({ label: location.label, href: location.href, muted: false });
		} else if (!hasDescription && (location.kind === 'geo' || location.kind === 'hthree')) {
			lines.push({ label: location.label, href: location.href, muted: false });
		}
	}
	return lines.filter(
		(line, index) => lines.findIndex((other) => other.label === line.label) === index
	);
}

/** Cards stay compact: prefer cities, falling back to the other physical variants. */
export function getLocationSummary(locations: LocationData[]): string | undefined {
	const physical = locations.filter((location) => location.kind !== 'uri' && location.summary);
	const cities = physical.filter((location) => location.kind === 'address');
	const links = locations.filter((location) => location.kind === 'uri');
	const described = physical.filter((location) => location.name || location.kind === 'fsq');
	const preferred = cities.length
		? cities
		: described.length
			? described.slice(0, 1)
			: links.length
				? []
				: physical.slice(0, 1);
	const labels = [...preferred, ...links].map((location) => location.summary);
	return [...new Set(labels)].filter(Boolean).join(' · ') || undefined;
}

export type GeoLocation = Coordinates & {
	label: string;
	googleMapsUrl: string;
	osmUrl: string;
};

function geoLocation(
	point: Coordinates,
	label: string,
	osmType?: string,
	osmId?: number
): GeoLocation {
	const { lat, lng } = point;
	return {
		...point,
		label,
		googleMapsUrl: mapsUrl(`${lat},${lng}`),
		osmUrl:
			(osmType === 'node' || osmType === 'way' || osmType === 'relation') && osmId
				? `https://www.openstreetmap.org/${osmType}/${osmId}`
				: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
	};
}

/** A single overview map: prefer explicit coordinates; otherwise geocode the first address. */
export async function resolveGeoLocation(locations: LocationData[]): Promise<GeoLocation | null> {
	const explicit =
		locations.find((location) => location.kind === 'geo' && location.coordinates) ??
		locations.find((location) => location.coordinates);
	if (explicit?.coordinates) return geoLocation(explicit.coordinates, explicit.label);

	const cells = locations.filter((location) => location.h3Cell);
	if (cells.length) {
		// H3 decoding is only loaded for events that actually use it, never for cards.
		try {
			const { isValidCell, cellToLatLng } = await import('h3-js');
			for (const location of cells) {
				if (!isValidCell(location.h3Cell!)) continue;
				const [lat, lng] = cellToLatLng(location.h3Cell!);
				return geoLocation({ lat, lng }, `${location.label} · Approximate area`);
			}
		} catch {}
	}

	const address = locations.find((location) => location.geocodeQuery);
	if (!address?.geocodeQuery) return null;
	try {
		const response = await fetch(`/api/geocoding?q=${encodeURIComponent(address.geocodeQuery)}`);
		if (!response.ok) return null;
		const data = (await response.json()) as {
			lat?: number;
			lng?: number;
			osmType?: string;
			osmId?: number;
		} | null;
		if (
			typeof data?.lat !== 'number' ||
			typeof data.lng !== 'number' ||
			!Number.isFinite(data.lat) ||
			!Number.isFinite(data.lng) ||
			Math.abs(data.lat) > 90 ||
			Math.abs(data.lng) > 180
		)
			return null;
		return geoLocation(
			{ lat: data.lat, lng: data.lng },
			address.geocodeQuery,
			data.osmType,
			data.osmId
		);
	} catch {
		return null;
	}
}
