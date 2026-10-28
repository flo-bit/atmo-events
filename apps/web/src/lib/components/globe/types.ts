export type Coordinates = readonly [longitude: number, latitude: number];

export interface GlobeEvent {
  id: string;
  title: string;
  /** ISO 8601 timestamp, including a timezone. */
  startsAt: string;
  endsAt?: string;
  category?: string;
  href?: string;
}

export interface GlobeMarker {
  id: string;
  label: string;
  lat: number;
  lon: number;
  events?: GlobeEvent[];
  href?: string;
}

export type MarkerMode = 'upcoming' | 'cities';
