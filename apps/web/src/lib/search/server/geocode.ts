// Forward geocoding for the near-me page: free-text address / zip / place
// name → coordinates, so users can search a location without sharing their
// device position. Uses Nominatim (OpenStreetMap); its usage policy requires
// an identifying User-Agent and tolerates only light traffic, which fits a
// user-initiated search box (never called in a loop). The policy's attribution
// requirement is satisfied by the OpenStreetMap credit shown on the near-me
// page. Heavier-traffic compliance (app-wide rate limiting, caching) is still
// a follow-up before high-volume exposure.
export type GeocodeResult = {
	lat: number;
	lng: number;
	/** Display name of the match, shown so users can spot a wrong match. */
	label: string;
};

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'atmo-events (https://atmo.rsvp)';

export async function geocodeLocation(
	q: string,
	fetchImpl: typeof fetch = fetch
): Promise<GeocodeResult | null> {
	const url = new URL(NOMINATIM_SEARCH_URL);
	url.searchParams.set('q', q);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '1');

	const response = await fetchImpl(url, {
		headers: { accept: 'application/json', 'user-agent': USER_AGENT }
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
