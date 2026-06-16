import { describe, it, expect } from 'vitest';
import { eventToSearchDoc, type EventRecordPayload } from './normalize';

const URI = 'at://did:plc:alice/community.lexicon.calendar.event/1';

function payload(record: Record<string, unknown>): EventRecordPayload {
	return { uri: URI, did: 'did:plc:alice', collection: 'community.lexicon.calendar.event', rkey: '1', record };
}

function geoLoc(latitude: string, longitude: string) {
	return { $type: 'community.lexicon.location.geo', latitude, longitude };
}

describe('eventToSearchDoc geo derivation', () => {
	it('sets _geo from in-range geo coordinates', () => {
		const doc = eventToSearchDoc(payload({ name: 'x', locations: [geoLoc('40.0', '-105.0')] }));
		expect(doc._geo).toEqual({ lat: 40, lng: -105 });
	});

	it('drops _geo when coordinates are out of WGS84 range but keeps the doc searchable', () => {
		// The source lexicons type lat/lng as free strings, so an out-of-range
		// value is schema-valid; Meilisearch would reject the doc and can fail the
		// whole batch. We drop _geo rather than index it.
		const doc = eventToSearchDoc(payload({ name: 'x', locations: [geoLoc('999', '-105.0')] }));
		expect(doc._geo).toBeUndefined();
		// Still indexed for text search; only radius search excludes it.
		expect(doc.name).toBe('x');
		expect(doc.locationTypes).toEqual(['community.lexicon.location.geo']);
	});

	it('drops _geo when longitude is out of range', () => {
		const doc = eventToSearchDoc(payload({ name: 'x', locations: [geoLoc('40.0', '-200')] }));
		expect(doc._geo).toBeUndefined();
	});

	it('accepts the boundary values', () => {
		expect(eventToSearchDoc(payload({ locations: [geoLoc('-90', '180')] }))._geo).toEqual({
			lat: -90,
			lng: 180
		});
	});

	it('leaves _geo unset when no location carries coordinates', () => {
		const doc = eventToSearchDoc(payload({ name: 'x', locations: [] }));
		expect(doc._geo).toBeUndefined();
	});
});
