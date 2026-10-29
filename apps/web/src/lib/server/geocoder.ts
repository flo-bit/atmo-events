// Interactive event address entry and maps. No bulk geocoding or search index.
export interface GeoPoint {
	lat: number;
	lng: number;
	precision?: string;
	label?: string;
	address?: Record<string, string>;
	osmType?: string;
	osmId?: number;
}
export interface GeocoderEnv {
	GEOCODER_URL?: string;
	GEOCODER_KEY?: string;
	GEOCODER_USER_AGENT?: string;
}
export const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
export const DEFAULT_GEOCODER_USER_AGENT = 'atmo-events (https://atmo.rsvp)';

export function createGeocoder(env: GeocoderEnv = {}, fetchImpl: typeof fetch = fetch) {
	return {
		async geocode(q: string): Promise<GeoPoint | null> {
			const url = new URL(env.GEOCODER_URL || DEFAULT_GEOCODER_URL);
			url.searchParams.set('q', q);
			url.searchParams.set('format', 'json');
			url.searchParams.set('limit', '1');
			url.searchParams.set('addressdetails', '1');
			if (env.GEOCODER_KEY && url.hostname !== 'nominatim.openstreetmap.org') {
				url.searchParams.set('key', env.GEOCODER_KEY);
			}
			const res = await fetchImpl(url, {
				headers: {
					accept: 'application/json',
					'user-agent': env.GEOCODER_USER_AGENT || DEFAULT_GEOCODER_USER_AGENT
				},
				signal: AbortSignal.timeout(5000)
			});
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`geocode request failed: ${res.status}`);
			const results = (await res.json()) as Array<{
				lat?: string;
				lon?: string;
				display_name?: string;
				address?: Record<string, string>;
				osm_type?: string;
				osm_id?: number;
			}>;
			const top = Array.isArray(results) ? results[0] : undefined;
			if (!top || top.lat == null || top.lon == null) return null;
			const lat = Number(top.lat),
				lng = Number(top.lon);
			if (
				!Number.isFinite(lat) ||
				!Number.isFinite(lng) ||
				Math.abs(lat) > 90 ||
				Math.abs(lng) > 180
			)
				return null;
			return {
				lat,
				lng,
				label: top.display_name,
				address: top.address,
				osmType: top.osm_type,
				osmId: top.osm_id
			};
		}
	};
}
