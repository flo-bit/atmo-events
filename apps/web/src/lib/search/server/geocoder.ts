// apps/web/src/lib/search/server/geocoder.ts
// One Nominatim-compatible geocoding client, config-selected. LocationIQ is
// API-compatible with Nominatim (same /search?q=&format=&limit= request, same
// lat/lon/type/class/display_name response — it IS hosted Nominatim), so this
// is one implementation parameterized by endpoint + optional key, not two
// behind an interface. Default = public Nominatim (parity with atmo today);
// set GEOCODER_KEY (+ GEOCODER_URL) to use LocationIQ. Used only by the
// external geocode job — geocoding never runs on the Worker hot path.
import { inGeoRange } from './normalize';

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

/** Public OSM Nominatim /search endpoint — the keyless default and the single
 *  source of the base geocoder URL. The near-me search box (geocode.ts) imports
 *  this so the two paths can't drift onto different hardcoded literals. */
export const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
/** Default identifying User-Agent. Nominatim's usage policy requires one; an
 *  operator can override it via GEOCODER_USER_AGENT (see resolveGeocoderUserAgent). */
export const DEFAULT_GEOCODER_USER_AGENT = 'atmo-events (https://atmo.rsvp)';
const PUBLIC_NOMINATIM_HOST = 'nominatim.openstreetmap.org';

/** Resolve the geocoder User-Agent: operator override (GEOCODER_USER_AGENT) else
 *  the atmo default. The single env-driven source both the bulk client and the
 *  near-me search box use, so the UA can't drift across paths. */
export function resolveGeocoderUserAgent(env: GeocoderEnv = {}): string {
	return env.GEOCODER_USER_AGENT || DEFAULT_GEOCODER_USER_AGENT;
}

/** True when the effective geocoder endpoint is public OSM Nominatim — i.e. the
 *  shared, usage-policy-bound host. The in-Worker drip uses this to pick SAFE
 *  defaults (a smaller per-tick cap + a slower throttle floor) when on Nominatim,
 *  rather than refusing to run: the drip works keyless out of the box, just
 *  policy-compliantly. `createGeocoder` falls back to DEFAULT_GEOCODER_URL (this host)
 *  when GEOCODER_URL is unset — even with a key present, in which case the ?key=
 *  is ignored and we're really on Nominatim — so an unset URL counts as public.
 *  Malformed URL → treated as public (fail safe toward the slower limits). A
 *  keyed, non-public GEOCODER_URL (LocationIQ) is the only way to lift them. */
export function isPublicNominatimHost(url: string | undefined): boolean {
	if (!url) return true;
	try {
		return new URL(url).hostname.toLowerCase() === PUBLIC_NOMINATIM_HOST;
	} catch {
		return true;
	}
}

// Same fixed order as the cache key, but a human-readable freeform query (commas,
// original case/diacritics) — both Nominatim and LocationIQ handle UTF-8 / non-
// Latin scripts. Freeform tolerates the messy data (city-in-name, JP street-only,
// trailing punctuation) a structured per-field query would drop.
const QUERY_FIELDS = ['name', 'street', 'locality', 'region', 'postalCode', 'country'];

/** Largest keyless run we treat as a sanctioned "small drip" against public
 *  Nominatim. Above this (or uncapped), a backfill must use LocationIQ. The
 *  in-Worker drip also clamps its per-tick cap to this when on public Nominatim. */
export const PUBLIC_NOMINATIM_DRIP_MAX = 25;

/** Throttle floor (ms between calls) for public Nominatim — its usage policy is
 *  an absolute max of 1 request/second. The drip enforces this as a FLOOR when on
 *  Nominatim (a faster GEOCODE_SLEEP_MS override can't undercut the policy); a
 *  keyed LocationIQ endpoint honors the operator's own, possibly faster, value. */
export const PUBLIC_NOMINATIM_MIN_SLEEP_MS = 1000;

/** Enforce the file's contract that a BULK backfill runs against a NON-PUBLIC
 *  endpoint (a keyed LocationIQ URL, or a self-hosted host), not public OSM
 *  Nominatim — whose usage policy a large run would breach, risking a silent IP
 *  ban. The deciding input is the EFFECTIVE endpoint, not key presence: a
 *  GEOCODER_KEY with an unset/public GEOCODER_URL still hits public Nominatim (the
 *  ?key= is ignored), so callers pass `!isPublicNominatimHost(GEOCODER_URL)` here
 *  rather than `!!GEOCODER_KEY`. Throws for a public-Nominatim, non-dry-run,
 *  non-overridden run that is uncapped (limit <= 0) or over the drip ceiling; a
 *  small public drip stays allowed. The hazard is request VOLUME, so the gate is
 *  on size. limit <= 0 (not just === 0) counts as uncapped so a stray negative
 *  can't masquerade as a tiny drip and slip the gate. */
export function requireGeocoderForBulk(opts: {
	nonPublicEndpoint: boolean;
	dryRun: boolean;
	limit: number;
	allowPublic: boolean;
}): void {
	if (opts.nonPublicEndpoint || opts.dryRun || opts.allowPublic) return;
	const bulk = opts.limit <= 0 || opts.limit > PUBLIC_NOMINATIM_DRIP_MAX;
	if (bulk) {
		throw new Error(
			`Keyless public Nominatim is only allowed for a small drip (--limit 1..${PUBLIC_NOMINATIM_DRIP_MAX}). ` +
				'Set GEOCODER_URL to your LocationIQ endpoint (with GEOCODER_KEY) for a bulk/uncapped backfill, ' +
				'or pass --allow-public-nominatim to override.'
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
	const base = env.GEOCODER_URL || DEFAULT_GEOCODER_URL;
	const key = env.GEOCODER_KEY;
	const userAgent = resolveGeocoderUserAgent(env);

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
			// Reject non-finite OR out-of-WGS84-range coordinates. Meilisearch
			// silently fails the whole async index task on a bad _geo (losing the
			// batch), and the sink guards its own path identically via the SAME
			// inGeoRange (normalize.ts). An out-of-range hit therefore becomes a
			// no-match (return null → negative cache w/ backoff) rather than a
			// poisoned coordinate that's cached as "resolved" and never retried.
			// inGeoRange returns false for NaN, so it subsumes the finite check.
			if (!inGeoRange(lat, lng)) return null;

			return { lat, lng, precision: derivePrecision(top) };
		}
	};
}
