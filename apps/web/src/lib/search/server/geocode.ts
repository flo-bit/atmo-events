// Forward geocoding for the near-me page: free-text address / zip / place
// name → coordinates, so users can search a location without sharing their
// device position. Uses Nominatim (OpenStreetMap); its usage policy requires
// an identifying User-Agent and tolerates only light traffic, which fits a
// user-initiated search box (never called in a loop). The policy's attribution
// requirement is satisfied by the OpenStreetMap credit shown on the near-me
// page. Heavier-traffic compliance (app-wide rate limiting, caching) is still
// a follow-up before high-volume exposure.
//
// This is a thin adapter over the shared createGeocoder client — the single
// forward-geocode client for every server-side path (near-me, the address-entry
// form's /api/geocoding endpoint, and the bulk drip). It therefore honors a
// configured GEOCODER_URL/GEOCODER_KEY (keyed LocationIQ) like the drip does:
// the key is appended server-side by the shared client and never reaches the
// browser, so the earlier "don't honor GEOCODER_URL, we send no ?key=" rationale
// no longer applies. Default remains public Nominatim when no key/URL is set.
import { createGeocoder, type GeocoderEnv } from './geocoder';

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
	const point = await createGeocoder(env, fetchImpl).geocode(q);
	if (!point) return null;
	return { lat: point.lat, lng: point.lng, label: point.label ?? q };
}
