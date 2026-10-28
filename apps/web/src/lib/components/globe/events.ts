import type { GlobeMarker, MarkerMode } from './types';

/** An event stays visible while it is happening; invalid dates never become pins. */
export function visibleMarkers(
  markers: GlobeMarker[],
  mode: MarkerMode,
  now: number,
  daysAhead: number,
): GlobeMarker[] {
  const horizon = now + Math.max(0, daysAhead) * 86_400_000;
  return markers
    .filter((marker) =>
      Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && Math.abs(marker.lat) <= 90,
    )
    .map((marker) => ({
      ...marker,
      events: (marker.events ?? [])
        .filter((event) => {
          const start = Date.parse(event.startsAt);
          const end = Date.parse(event.endsAt ?? event.startsAt);
          return Number.isFinite(start) && Number.isFinite(end) && end >= now && start <= horizon;
        })
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    }))
    .filter((marker) => mode === 'cities' || marker.events.length > 0);
}

export function eventDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
}
