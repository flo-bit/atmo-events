// apps/web/src/lib/search/server/geocoder.ts
// One Nominatim-compatible geocoding client, config-selected. LocationIQ is
// API-compatible with Nominatim (same /search?q=&format=&limit= request, same
// lat/lon/type/class/display_name response — it IS hosted Nominatim), so this
// is one implementation parameterized by endpoint + optional key, not two
// behind an interface. Default = public Nominatim (parity with atmo today);
// set GEOCODER_KEY (+ GEOCODER_URL) to use LocationIQ. Used only by the
// external geocode job — geocoding never runs on the Worker hot path.

export interface GeoPoint {
	lat: number;
	lng: number;
	/** Provider-reported granularity tier (rooftop/street/locality/...). */
	precision?: string;
}

export interface Geocoder {
	geocode(q: string): Promise<GeoPoint | null>;
}

export interface GeocoderEnv {
	GEOCODER_URL?: string;
	GEOCODER_KEY?: string;
	GEOCODER_USER_AGENT?: string;
}

const DEFAULT_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'atmo-events (https://atmo.rsvp)';

// Same fixed order as the cache key, but a human-readable freeform query (commas,
// original case/diacritics) — both Nominatim and LocationIQ handle UTF-8 / non-
// Latin scripts. Freeform tolerates the messy data (city-in-name, JP street-only,
// trailing punctuation) a structured per-field query would drop.
const QUERY_FIELDS = ['name', 'street', 'locality', 'region', 'postalCode', 'country'];

/** Largest keyless run we treat as a sanctioned "small drip" against public
 *  Nominatim. Above this (or uncapped), a backfill must use LocationIQ. */
export const PUBLIC_NOMINATIM_DRIP_MAX = 25;

/** Enforce the file's contract that a BULK backfill uses LocationIQ, not public
 *  Nominatim (whose usage policy a large unkeyed run would breach, risking a
 *  silent IP ban). Throws for a keyless, non-dry-run, non-overridden run that is
 *  uncapped (limit <= 0) or over the drip ceiling; a small keyless drip stays
 *  allowed. The hazard is request VOLUME, so the gate is on size, not on the
 *  mere use of Nominatim. limit <= 0 (not just === 0) counts as uncapped so a
 *  stray negative can't masquerade as a tiny drip and slip the gate. */
export function requireGeocoderForBulk(opts: {
	hasKey: boolean;
	dryRun: boolean;
	limit: number;
	allowPublic: boolean;
}): void {
	if (opts.hasKey || opts.dryRun || opts.allowPublic) return;
	const bulk = opts.limit <= 0 || opts.limit > PUBLIC_NOMINATIM_DRIP_MAX;
	if (bulk) {
		throw new Error(
			`Keyless public Nominatim is only allowed for a small drip (--limit 1..${PUBLIC_NOMINATIM_DRIP_MAX}). ` +
				'Set GEOCODER_KEY (LocationIQ) for a bulk/uncapped backfill, or pass --allow-public-nominatim to override.'
		);
	}
}

export function addressToQuery(loc: Record<string, unknown>): string {
	return QUERY_FIELDS.map((f) => (typeof loc[f] === 'string' ? (loc[f] as string).trim() : ''))
		.filter((v) => v !== '')
		.join(', ');
}

type NominatimHit = {
	lat?: string;
	lon?: string;
	display_name?: string;
	type?: string;
	class?: string;
	place_rank?: number;
	addresstype?: string;
};

const ROOFTOP = new Set(['house', 'building', 'address', 'house_number']);
const STREET = new Set(['road', 'street', 'residential', 'pedestrian']);
const LOCALITY = new Set([
	'city',
	'town',
	'village',
	'hamlet',
	'suburb',
	'locality',
	'municipality',
	'administrative',
	'state',
	'region',
	'province',
	'country'
]);

export function derivePrecision(top: {
	type?: string;
	class?: string;
	place_rank?: number;
	addresstype?: string;
}): string {
	const t = top.addresstype || top.type || '';
	if (ROOFTOP.has(t) || (top.place_rank ?? 0) >= 30) return 'rooftop';
	if (STREET.has(t) || top.class === 'highway') return 'street';
	if (LOCALITY.has(t) || top.class === 'boundary' || top.class === 'place') return 'locality';
	return t || 'unknown';
}

export function createGeocoder(env: GeocoderEnv = {}, fetchImpl: typeof fetch = fetch): Geocoder {
	const base = env.GEOCODER_URL || DEFAULT_URL;
	const key = env.GEOCODER_KEY;
	const userAgent = env.GEOCODER_USER_AGENT || DEFAULT_USER_AGENT;

	return {
		async geocode(q: string): Promise<GeoPoint | null> {
			const url = new URL(base);
			url.searchParams.set('q', q);
			url.searchParams.set('format', 'json');
			url.searchParams.set('limit', '1');
			if (key) url.searchParams.set('key', key);

			const res = await fetchImpl(url, {
				headers: { accept: 'application/json', 'user-agent': userAgent }
			});
			// NO-MATCH vs TRANSIENT. Nominatim signals no-match as 200 + []; LocationIQ
			// signals it as 404 (e.g. {"error":"Unable to geocode"}). Treat 404 as a
			// no-match (return null → negative cache w/ backoff) so an ungeocodable
			// address isn't retried every run. Other non-2xx (429 rate-limit, 5xx,
			// transport) throw → the job treats them as TRANSIENT and retries next run.
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`geocode request failed: ${res.status}`);

			const results = (await res.json()) as NominatimHit[];
			const top = Array.isArray(results) ? results[0] : undefined;
			if (!top) return null;

			const lat = Number(top.lat);
			const lng = Number(top.lon);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

			return { lat, lng, precision: derivePrecision(top) };
		}
	};
}
