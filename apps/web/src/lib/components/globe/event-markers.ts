import { eventUrl, type FlatEventRecord } from '@atmo-dev/events-ui';
import type { GlobeMarker } from './types';

function coordinate(value: unknown): number | null {
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && !value.trim()) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

/** Use existing record coordinates only: no browser geocoding or invented locations. */
export function eventMarkers(
	events: FlatEventRecord[],
	handles: Record<string, string> = {}
): GlobeMarker[] {
	const markers = new Map<string, GlobeMarker>();
	const seen = new Set<string>();
	for (const event of events) {
		if (seen.has(event.uri)) continue;
		seen.add(event.uri);
		if (event.mode?.endsWith('#virtual')) continue;
		for (const location of event.locations ?? []) {
			if (location.$type !== 'community.lexicon.location.geo') continue;
			const lat = coordinate(location.latitude);
			const lon = coordinate(location.longitude);
			if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
			const address = event.locations?.find(
				(value) => value.$type === 'community.lexicon.location.address'
			);
			const city = typeof address?.locality === 'string' ? address.locality.trim() : '';
			const venue = [address?.name, location.name].find(
				(value): value is string => typeof value === 'string' && !!value.trim()
			);
			// Imported geo names often contain an entire reverse-geocoded address.
			// Keep its venue name, not a multi-line postal address in the heading.
			const label = city || venue?.split(',')[0].trim() || 'Event location';
			const id = `${lat.toFixed(2)},${lon.toFixed(2)}`;
			let marker = markers.get(id);
			if (!marker) {
				marker = { id, label, lat, lon, events: [] };
				markers.set(id, marker);
			}
			marker.events!.push({
				id: event.uri,
				title: event.name,
				startsAt: event.startsAt,
				endsAt: event.endsAt,
				href: eventUrl(event, handles[event.did])
			});
			// One pin per event; the first valid geographic location is its primary venue.
			break;
		}
	}
	return [...markers.values()];
}
