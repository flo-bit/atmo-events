import { describe, expect, it } from 'vitest';
import { eventToSearchDoc, recordGeo } from './normalize';
// Import the REAL editor builder (the write side) so this asserts the actual
// end-to-end: a picked geocoder result -> emitted locations[] -> a search doc
// with a _geo. Relative into the sibling workspace package's source (same
// cross-package reference apps/web/src/app.css already makes).
import {
	buildLocationEntries,
	geocodeResponseToLocation,
	type GeocodeResponse
} from '../../../../../../packages/ui/src/editor/location';

// Normalized /api/geocoding response for the flagship repro (Humboldt Park).
const HUMBOLDT_PARK: GeocodeResponse = {
	lat: 41.9027884,
	lng: -87.7209107,
	label:
		'Humboldt Park, Chicago, West Chicago Township, Cook County, Illinois, 60651, United States',
	name: 'Humboldt Park',
	category: 'place',
	placeType: 'suburb',
	address: {
		suburb: 'Humboldt Park',
		city: 'Chicago',
		municipality: 'West Chicago Township',
		county: 'Cook County',
		state: 'Illinois',
		postcode: '60651',
		country_code: 'us',
		country: 'United States'
	}
};

function recordFor(response: GeocodeResponse): Record<string, unknown> {
	return {
		$type: 'community.lexicon.calendar.event',
		name: 'Test event',
		locations: buildLocationEntries(geocodeResponseToLocation(response))
	};
}

describe('authored location -> search _geo', () => {
	it('emits an address+geo pair the search normalizer derives a _geo from', () => {
		const record = recordFor(HUMBOLDT_PARK);
		const locations = record.locations as Array<Record<string, unknown>>;

		// The builder emitted BOTH an address entry (with the place name) and a
		// geo entry carrying the coordinates as strings.
		expect(locations.map((l) => l.$type)).toEqual([
			'community.lexicon.location.address',
			'community.lexicon.location.geo'
		]);
		expect(locations[0].name).toBe('Humboldt Park');

		// normalize.ts derives the canonical _geo from that geo entry.
		expect(recordGeo(record)).toEqual({ lat: 41.9027884, lng: -87.7209107 });

		const doc = eventToSearchDoc({
			uri: 'at://did:plc:test/community.lexicon.calendar.event/abc',
			did: 'did:plc:test',
			collection: 'community.lexicon.calendar.event',
			rkey: 'abc',
			record
		});
		// _geo present => the event is included in Meili radius / near-me search.
		expect(doc._geo).toEqual({ lat: 41.9027884, lng: -87.7209107 });
	});

	it('a city-only pick still yields a _geo (coordinates preserved)', () => {
		const record = recordFor({
			lat: 41.8755616,
			lng: -87.6244212,
			label: 'Chicago, Cook County, Illinois, United States',
			name: 'Chicago',
			category: 'boundary',
			placeType: 'administrative',
			address: {
				city: 'Chicago',
				county: 'Cook County',
				state: 'Illinois',
				country_code: 'us',
				country: 'United States'
			}
		});
		const locations = record.locations as Array<Record<string, unknown>>;
		// The name is stored even though it restates `locality`. Readers drop the
		// repeat at display time (dropRepeats), which they must do anyway for the
		// records other clients wrote, so the card still reads "Chicago, Illinois".
		expect(locations[0]).toMatchObject({ name: 'Chicago', locality: 'Chicago' });
		expect(recordGeo(record)).toEqual({ lat: 41.8755616, lng: -87.6244212 });
	});

	it('a pick with no ISO country code keeps BOTH its address context and its _geo', () => {
		// The address entry is incomplete — the lexicon requires country — but it is
		// written rather than dropped, so the town survives; and the geo entry beside
		// it is exactly what search needs, so the event also stays findable.
		const record = recordFor({
			lat: 41.9027884,
			lng: -87.7209107,
			label: 'Humboldt Park, Chicago, Illinois, United States',
			name: 'Humboldt Park',
			category: 'place',
			placeType: 'suburb',
			address: { suburb: 'Humboldt Park', city: 'Chicago', country: 'United States' }
		});
		const locations = record.locations as Array<Record<string, unknown>>;
		expect(locations.map((l) => l.$type)).toEqual([
			'community.lexicon.location.address',
			'community.lexicon.location.geo'
		]);
		expect(locations[0]).toMatchObject({ name: 'Humboldt Park', locality: 'Chicago' });
		expect(recordGeo(record)).toEqual({ lat: 41.9027884, lng: -87.7209107 });
	});
});
