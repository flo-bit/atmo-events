// Normalizes community.lexicon.calendar.event records into Meilisearch
// documents written by the search sink (the write half of the search path;
// the read half lives in ./meili.ts). The locations[] union collapses to a
// single canonical _geo point with precedence geo > fsq > hthree (hthree via
// the h3 cell center); records with no coordinate-bearing location get no _geo
// and are simply excluded from radius search while staying text-searchable.
import { cellToLatLng, isValidCell } from 'h3-js';

export interface SearchDoc {
	/** Meilisearch primary key — base64url of the AT-URI (see searchDocId). */
	id: string;
	uri: string;
	did: string;
	rkey: string;
	name?: string;
	description?: string;
	startsAt?: string;
	endsAt?: string;
	mode?: string;
	status?: string;
	createdAt?: string;
	/** Original location $types, kept as a filterable facet. */
	locationTypes: string[];
	/** Meilisearch geosearch field. */
	_geo?: { lat: number; lng: number };
}

export interface EventRecordPayload {
	uri: string;
	did: string;
	collection: string;
	rkey: string;
	record: Record<string, unknown>;
}

/** Meilisearch primary keys only allow [A-Za-z0-9_-], so encode the AT-URI as
 *  base64url. Derivable from the uri alone — deletes carry no record. Uses
 *  btoa rather than Buffer so it's identical on the Cloudflare Worker runtime
 *  (the byte-for-byte base64url is the same either way). */
export function searchDocId(uri: string): string {
	const bytes = new TextEncoder().encode(uri);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const GEO = 'community.lexicon.location.geo';
const FSQ = 'community.lexicon.location.fsq';
const HTHREE = 'community.lexicon.location.hthree';

type Loc = Record<string, unknown>;

// The source lexicons don't enforce coordinate ranges, so a record can carry a
// finite-but-out-of-range value. Meilisearch rejects such a doc and can fail
// the whole async indexing task (losing the rest of the batch), so we drop the
// _geo here rather than index it. Bounds are WGS84: lat [-90, 90], lng [-180, 180].
// Exported so the geocoder (geocoder.ts) range-checks its results against the
// EXACT same bounds — a geocoder hit and a record's own coords must not be able
// to disagree on what Meili will accept. NaN fails every comparison, so this also
// rejects non-finite input.
export function inGeoRange(lat: number, lng: number): boolean {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseCoords(loc: Loc): { lat: number; lng: number } | null {
	const lat = Number(loc.latitude);
	const lng = Number(loc.longitude);
	if (
		typeof loc.latitude !== 'string' ||
		typeof loc.longitude !== 'string' ||
		!Number.isFinite(lat) ||
		!Number.isFinite(lng) ||
		!inGeoRange(lat, lng)
	) {
		return null;
	}
	return { lat, lng };
}

function h3Coords(loc: Loc): { lat: number; lng: number } | null {
	if (typeof loc.value !== 'string' || !isValidCell(loc.value)) return null;
	const [lat, lng] = cellToLatLng(loc.value);
	return inGeoRange(lat, lng) ? { lat, lng } : null;
}

function deriveGeo(locations: Loc[]): { lat: number; lng: number } | undefined {
	for (const extract of [
		(l: Loc) => (l.$type === GEO ? parseCoords(l) : null),
		(l: Loc) => (l.$type === FSQ ? parseCoords(l) : null),
		(l: Loc) => (l.$type === HTHREE ? h3Coords(l) : null)
	]) {
		for (const loc of locations) {
			const geo = extract(loc);
			if (geo) return geo;
		}
	}
	return undefined;
}

function str(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

/** The record's locations[] narrowed to the location objects deriveGeo and the
 *  doc builder read. */
function recordLocations(record: Record<string, unknown>): Loc[] {
	return (Array.isArray(record?.locations) ? record.locations : []).filter(
		(l): l is Loc => !!l && typeof l === 'object'
	);
}

/** The single canonical _geo a record resolves to (precedence geo > fsq >
 *  hthree, in-range only), or undefined. Shared by the search doc AND the
 *  external geocode worklist so "already has coordinates" means the exact same
 *  thing in both: the worklist must not geocode an event the index already
 *  geo-derives (which would overwrite precise fsq/geo coords), and must still
 *  geocode one whose only coordinate location is out of range (no _geo). */
export function recordGeo(
	record: Record<string, unknown>
): { lat: number; lng: number } | undefined {
	return deriveGeo(recordLocations(record));
}

export function eventToSearchDoc(payload: EventRecordPayload): SearchDoc {
	const record = payload.record ?? {};
	const locations = recordLocations(record);

	const doc: SearchDoc = {
		id: searchDocId(payload.uri),
		uri: payload.uri,
		did: payload.did,
		rkey: payload.rkey,
		name: str(record.name),
		description: str(record.description),
		startsAt: str(record.startsAt),
		endsAt: str(record.endsAt),
		mode: str(record.mode),
		status: str(record.status),
		createdAt: str(record.createdAt),
		locationTypes: locations.map((l) => str(l.$type)).filter((t): t is string => !!t)
	};
	const geo = deriveGeo(locations);
	if (geo) doc._geo = geo;
	return doc;
}
