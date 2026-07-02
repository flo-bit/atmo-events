import { json } from '@sveltejs/kit';
import { createGeocoder } from '$lib/search/server/geocoder';

// Forward-geocode the address-entry form's free-text query. Server-only (auth-
// gated on the signed-in DID) and routed through the ONE shared createGeocoder
// client, so it shares the single Nominatim/LocationIQ URL, User-Agent and key
// handling with the near-me search box and the bulk drip — no local endpoint or
// UA literal here. Returns a normalized { lat, lng, label, address, ... } shape
// (never the raw upstream object): the key, when configured, is appended inside
// the Worker and never reaches the browser.
export async function GET({ url, locals, platform, fetch }) {
	if (!locals.did) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	const q = url.searchParams.get('q');
	if (!q) {
		return json({ error: 'No search provided' }, { status: 400 });
	}

	try {
		const point = await createGeocoder(platform?.env ?? {}, fetch).geocode(q);
		if (!point) {
			return json({ error: 'No results' }, { status: 404 });
		}
		return json({
			lat: point.lat,
			lng: point.lng,
			label: point.label ?? q,
			address: point.address ?? {},
			osmType: point.osmType,
			osmId: point.osmId
		});
	} catch (error) {
		console.error('Error fetching location:', q, error);
		return json({ error: 'Failed to fetch location' }, { status: 500 });
	}
}
