import { describe, expect, it } from 'vitest';
import { eventDate, visibleMarkers } from './events';
import type { GlobeMarker } from './types';

const now = Date.parse('2026-04-10T12:00:00Z');
const marker: GlobeMarker = {
  id: 'berlin', label: 'Berlin', lat: 52.52, lon: 13.405,
  events: [
    { id: 'past', title: 'Past', startsAt: '2026-04-09T10:00:00Z' },
    { id: 'later', title: 'Later', startsAt: '2026-04-17T10:00:00Z' },
    { id: 'ongoing', title: 'Ongoing', startsAt: '2026-04-10T10:00:00Z', endsAt: '2026-04-10T14:00:00Z' },
    { id: 'near', title: 'Near', startsAt: '2026-04-11T10:00:00Z' },
    { id: 'far', title: 'Far', startsAt: '2027-01-01T10:00:00Z' },
    { id: 'invalid', title: 'Invalid', startsAt: 'not-a-date' },
  ],
};

describe('event markers', () => {
  it('filters the date window, retains ongoing events, and sorts by start date', () => {
    const result = visibleMarkers([marker], 'upcoming', now, 30);
    expect(result[0].events?.map((event) => event.id)).toEqual(['ongoing', 'near', 'later']);
    expect(marker.events).toHaveLength(6);
  });

  it('automatically hides cities without upcoming events in upcoming mode', () => {
    expect(visibleMarkers([{ ...marker, events: [] }], 'upcoming', now, 30)).toEqual([]);
  });

  it('retains cities without events in city mode', () => {
    expect(visibleMarkers([{ ...marker, events: [] }], 'cities', now, 30)).toHaveLength(1);
  });

  it('accepts markers without an events array in city mode', () => {
    expect(visibleMarkers([{ ...marker, events: undefined }], 'cities', now, 30)[0].events).toEqual([]);
  });

  it('handles empty input', () => {
    expect(visibleMarkers([], 'upcoming', now, 30)).toEqual([]);
  });

  it('rejects invalid coordinates', () => {
    expect(visibleMarkers([
      { ...marker, lat: 91 }, { ...marker, lon: Number.NaN }, { ...marker, lat: Infinity },
    ], 'cities', now, 30)).toEqual([]);
  });

  it('updates when the clock passes an event', () => {
    const single = { ...marker, events: [marker.events![3]] };
    expect(visibleMarkers([single], 'upcoming', now, 30)).toHaveLength(1);
    expect(visibleMarkers([single], 'upcoming', Date.parse('2026-04-12T00:00:00Z'), 30)).toHaveLength(0);
  });

  it('formats calendar dates consistently across server and browser timezones', () => {
    expect(eventDate('2026-04-11T00:00:00Z')).toBe('Apr 11');
  });
});
