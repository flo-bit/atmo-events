// Forward geocoding for the near-me page: free-text address / zip / place
// name → coordinates, so users can search a location without sharing their
// device position. Uses Nominatim (OpenStreetMap); its usage policy requires
// an identifying User-Agent and tolerates only light traffic, which fits a
// user-initiated search box (never called in a loop). The policy's attribution
// requirement is satisfied by the OpenStreetMap credit shown on the near-me
// page. Heavier-traffic compliance (app-wide rate limiting, caching) is still
// a follow-up before high-volume exposure.
//
// Base URL and User-Agent come from the shared geocoder module (one canonical
// source, no duplicate literals). This path stays on public Nominatim — it does
// NOT honor a configured GEOCODER_URL, because that endpoint may be a keyed
// LocationIQ URL and this hot-path forward search sends no ?key= (it would 401).
import { DEFAULT_GEOCODER_URL, resolveGeocoderUserAgent, type GeocoderEnv } from './geocoder';

export type GeocodeResult = {
	lat: number;
	lng: number;
	/** Display name of the match, shown so users can spot a wrong match. */
	label: string;
};

export async function geocodeLocation(
	q: string,
	fetchImpl: typeof fetch = fetch,
	env: GeocoderEnv = {}
): Promise<GeocodeResult | null> {
	const url = new URL(DEFAULT_GEOCODER_URL);
	url.searchParams.set('q', q);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '1');

	const response = await fetchImpl(url, {
		headers: { accept: 'application/json', 'user-agent': resolveGeocoderUserAgent(env) }
	});
	if (!response.ok) {
		throw new Error(`geocode request failed: ${response.status}`);
	}

	const results = (await response.json()) as {
		lat?: string;
		lon?: string;
		display_name?: string;
	}[];
	const top = results[0];
	if (!top) return null;

	const lat = Number(top.lat);
	const lng = Number(top.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	return { lat, lng, label: top.display_name ?? q };
}
