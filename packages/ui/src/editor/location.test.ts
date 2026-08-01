import { describe, expect, it } from 'vitest';
import {
	ADDRESS_TYPE,
	GEO_TYPE,
	buildLocationEntries,
	eventLocationFromEntries,
	geocodeResponseToLocation,
	locationsForSave,
	type GeocodeResponse
} from './location';
import { getLocationDisplayString, type EventLocation } from './types';
import { locationShortLabel } from '../location-summary';

// Fixtures are the NORMALIZED /api/geocoding response shape ({ lat, lng, label,
// name, category, placeType, address }) — what the picker consumes — NOT the raw
// upstream object. The proxy already folds the provider difference: Nominatim's
// top-level `name` and LocationIQ's namedetails.name both arrive as `name`, and
// OSM class/type arrive as category/placeType. The proxy is tested at its own
// boundary (apps/web .../api/geocoding/server.test.ts + geocoder.test.ts).
//
// Values captured from live Nominatim + LocationIQ (addressdetails=1,
// namedetails=1).

const PARK: GeocodeResponse = {
	lat: 41.9027884,
	lng: -87.7209107,
	label: 'Humboldt Park, Chicago, Cook County, Illinois, 60651, United States',
	name: 'Humboldt Park',
	category: 'place',
	placeType: 'suburb',
	address: {
		suburb: 'Humboldt Park',
		city: 'Chicago',
		county: 'Cook County',
		state: 'Illinois',
		postcode: '60651',
		country_code: 'us',
		country: 'United States'
	}
};

const POI: GeocodeResponse = {
	lat: 41.9134,
	lng: -87.6487,
	label: 'Alinea, 1723, North Halsted Street, Chicago, Cook County, Illinois, 60614, United States',
	name: 'Alinea',
	category: 'amenity',
	placeType: 'restaurant',
	address: {
		house_number: '1723',
		road: 'North Halsted Street',
		city: 'Chicago',
		state: 'Illinois',
		postcode: '60614',
		country_code: 'us',
		country: 'United States'
	}
};

const CITY: GeocodeResponse = {
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
};

const ROAD: GeocodeResponse = {
	lat: 40.7549,
	lng: -73.984,
	label: '5th Avenue, Manhattan, New York, United States',
	name: '5th Avenue',
	category: 'highway',
	placeType: 'secondary',
	address: {
		road: '5th Avenue',
		city: 'New York',
		state: 'New York',
		country_code: 'us',
		country: 'United States'
	}
};

// A park mapped as an OSM boundary (Yellowstone comes back boundary/protected_area
// on LocationIQ). A blanket boundary rejection would drop its name — it must not.
const PARK_AS_BOUNDARY: GeocodeResponse = {
	lat: 44.428,
	lng: -110.5885,
	label: 'Yellowstone National Park, Wyoming, United States',
	name: 'Yellowstone National Park',
	category: 'boundary',
	placeType: 'protected_area',
	address: { state: 'Wyoming', country_code: 'us', country: 'United States' }
};

// An unnamed building. namedetails is empty, so the proxy forwards NO `name`; the
// display label leads with the house number. The mapper must produce no place
// name (and must NOT fall back to the label's "1234").
const UNNAMED_BUILDING: GeocodeResponse = {
	lat: 42.0,
	lng: -87.66,
	label: '1234, West Farwell Avenue, Chicago, Cook County, Illinois, 60626, United States',
	category: 'building',
	placeType: 'yes',
	address: {
		house_number: '1234',
		road: 'West Farwell Avenue',
		city: 'Chicago',
		state: 'Illinois',
		postcode: '60626',
		country_code: 'us',
		country: 'United States'
	}
};

describe('geocodeResponseToLocation — place name', () => {
	it('keeps the name for a named place (park/suburb)', () => {
		const loc = geocodeResponseToLocation(PARK);
		expect(loc.name).toBe('Humboldt Park');
		expect(loc.locality).toBe('Chicago');
		expect(loc.region).toBe('Illinois');
		expect(loc.coords).toEqual({ lat: 41.9027884, lng: -87.7209107 });
	});

	it('keeps the name for a POI, alongside its street', () => {
		const loc = geocodeResponseToLocation(POI);
		expect(loc.name).toBe('Alinea');
		expect(loc.street).toBe('North Halsted Street 1723');
	});

	it('keeps the name for a park mapped as an OSM boundary (protected_area)', () => {
		// Regression: blanket boundary rejection would drop this (the original bug).
		const loc = geocodeResponseToLocation(PARK_AS_BOUNDARY);
		expect(loc.name).toBe('Yellowstone National Park');
	});

	it('uses the forwarded name, never the display label', () => {
		// name and the label's leading segment deliberately differ.
		const loc = geocodeResponseToLocation({
			...PARK,
			label: 'Totally Different Leading Segment, Chicago, Illinois, United States'
		});
		expect(loc.name).toBe('Humboldt Park');
	});
});

describe('geocodeResponseToLocation — no place name', () => {
	it('drops the name for an UNNAMED building — and does NOT use the label house number', () => {
		// Regression (the sharp one): building/yes has no name; label leads "1234".
		const loc = geocodeResponseToLocation(UNNAMED_BUILDING);
		expect(loc.name).toBeUndefined();
		expect(loc.street).toBe('West Farwell Avenue 1234');
	});

	it('yields no place name when the result carries no class/type at all', () => {
		const loc = geocodeResponseToLocation({
			label: 'Mystery Place, Chicago, United States',
			name: 'Mystery Place',
			address: { city: 'Chicago', country_code: 'us' }
		});
		expect(loc.name).toBeUndefined();
	});
});

describe('geocodeResponseToLocation — named features keep their name unconditionally', () => {
	// Anything outside place/boundary/highway is a named feature: the name IS the
	// pick, so no redundancy check applies. Table is independent of the production
	// set (NOT derived from it) so a change in the implementation surfaces here.
	const FEATURES: Array<[category: string, placeType: string]> = [
		['amenity', 'restaurant'],
		['leisure', 'park'],
		['leisure', 'stadium'],
		['tourism', 'museum'],
		['building', 'commercial'],
		['aeroway', 'aerodrome'],
		['railway', 'station'],
		['natural', 'bay'],
		['historic', 'castle'],
		['shop', 'books']
	];
	for (const [category, placeType] of FEATURES) {
		it(`keeps the name for ${category}/${placeType}`, () => {
			const loc = geocodeResponseToLocation({
				label: `The Place, Chicago, Illinois, United States`,
				name: 'The Place',
				category,
				placeType,
				address: { city: 'Chicago', state: 'Illinois', country_code: 'us' }
			});
			expect(loc.name).toBe('The Place');
		});
	}

	it('keeps a feature name even when it EQUALS the locality', () => {
		// A bar called "Paris", in Paris. Applying the redundancy check to every
		// class would silently delete its name.
		const loc = geocodeResponseToLocation({
			name: 'Paris',
			category: 'amenity',
			placeType: 'bar',
			address: { city: 'Paris', country: 'France', country_code: 'fr' }
		});
		expect(loc.name).toBe('Paris');
	});
});

describe('geocodeResponseToLocation — highway features keep their name', () => {
	it('keeps the name of a named highway feature even beside a matching road', () => {
		// A bus stop / trailhead named after its street is still the picked object,
		// not the road — the redundancy check must not fire for non-road highway.
		for (const placeType of ['bus_stop', 'trailhead', 'services', 'rest_area']) {
			const loc = geocodeResponseToLocation({
				name: 'Main Street',
				category: 'highway',
				placeType,
				address: { road: 'Main Street', city: 'Anytown', country_code: 'us' }
			});
			expect(loc.name).toBe('Main Street');
		}
	});

	it('keeps the name of a pedestrian way, which is usually the picked destination', () => {
		// A named trail, a flight of steps, a plaza: the highway tag classifies the
		// surface, but the name is what the user picked. Dropping it puts the card
		// back on the town — the bug this module exists to fix.
		for (const placeType of [
			'path',
			'footway',
			'cycleway',
			'bridleway',
			'steps',
			'pedestrian',
			// A named forest road is a destination for exactly the outdoor events that
			// motivated this fix, and OSM gives `track` its own `name=*` too.
			'track'
		]) {
			const loc = geocodeResponseToLocation({
				name: 'Rocky Steps',
				category: 'highway',
				placeType,
				address: { road: 'Rocky Steps', city: 'Philadelphia', country_code: 'us' }
			});
			expect(loc.name).toBe('Rocky Steps');
		}
	});

	it('carries a pedestrian way name all the way to the card', () => {
		// The end the user sees. locationShortLabel shows name + locality/region and
		// NOT the street, so a dropped name leaves the card reading "Philadelphia,
		// Pennsylvania" for an event on the Rocky Steps — the reported bug exactly.
		const entries = buildLocationEntries(
			geocodeResponseToLocation({
				lat: 39.9656,
				lng: -75.181,
				name: 'Rocky Steps',
				category: 'highway',
				placeType: 'steps',
				address: {
					road: 'Rocky Steps',
					city: 'Philadelphia',
					state: 'Pennsylvania',
					country_code: 'us'
				}
			})
		);
		expect(locationShortLabel(entries)).toBe('Rocky Steps, Philadelphia, Pennsylvania');
	});
});

describe('geocodeResponseToLocation — country is an ISO code', () => {
	it('stores the uppercased country_code, not the free-text country name', () => {
		// The address lexicon caps country at 10 chars and wants an ISO code.
		expect(geocodeResponseToLocation(PARK).country).toBe('US');
		expect(
			geocodeResponseToLocation({
				...PARK,
				address: { ...PARK.address, country_code: 'gb', country: 'United Kingdom' }
			}).country
		).toBe('GB');
	});

	it('falls back to the country half of an ISO3166-2 subdivision code', () => {
		const loc = geocodeResponseToLocation({
			...PARK,
			address: {
				city: 'Chicago',
				state: 'Illinois',
				'ISO3166-2-lvl4': 'US-IL',
				country: 'United States'
			}
		});
		expect(loc.country).toBe('US');
	});

	it('omits country when neither a country_code nor an ISO3166-2 code is given', () => {
		// No name->ISO guessing: "United States" is not a code, and inventing one is
		// separate work (it needs a map and a migration for legacy records).
		const loc = geocodeResponseToLocation({
			...PARK,
			address: { suburb: 'Humboldt Park', city: 'Chicago', country: 'United States' }
		});
		expect(loc.country).toBeUndefined();
	});

	it('rejects values that are not shaped like ISO codes', () => {
		// Anything slipping through reaches `country`, which the lexicon constrains
		// to 2-10 chars and describes as an ISO 3166 code.
		const bad: Array<Record<string, string>> = [
			{ country_code: 'U' }, // too short — would be lexicon-invalid
			{ country_code: 'USA1' }, // not alpha-2
			{ country_code: 'United States' }, // the free-text name in the wrong field
			{ 'ISO3166-2-lvl4': 'Illinois' }, // a subdivision NAME, not a code
			{ 'ISO3166-2-lvl4': 'bogus-code' }, // right shape, wrong country half
			{ 'ISO3166-2-nonsense': 'US-IL' } // not a subdivision key
		];
		for (const address of bad) {
			expect(geocodeResponseToLocation({ ...PARK, address }).country).toBeUndefined();
		}
	});

	it('accepts an ISO3166-2 key with or without a level suffix', () => {
		expect(geocodeResponseToLocation({ ...PARK, address: { 'ISO3166-2': 'GB-ENG' } }).country).toBe(
			'GB'
		);
		expect(
			geocodeResponseToLocation({ ...PARK, address: { 'ISO3166-2-lvl6': 'us-il' } }).country
		).toBe('US');
	});
});

describe('geocodeResponseToLocation — coordinates', () => {
	it('keeps finite coordinates, including 0', () => {
		const loc = geocodeResponseToLocation({
			lat: 0,
			lng: 0,
			category: 'amenity',
			placeType: 'cafe',
			name: 'Null Island Cafe',
			address: { country_code: 'xz' }
		});
		expect(loc.coords).toEqual({ lat: 0, lng: 0 });
	});

	it('drops non-finite coordinates', () => {
		const loc = geocodeResponseToLocation({
			lat: Number.NaN,
			lng: 10,
			category: 'boundary',
			placeType: 'administrative',
			address: { city: 'Somewhere' }
		});
		expect(loc.coords).toBeUndefined();
	});
});

describe('buildLocationEntries — emitted locations[]', () => {
	it('emits an address entry (name + ISO country) AND a geo entry with string coords', () => {
		const entries = buildLocationEntries(geocodeResponseToLocation(PARK));
		expect(entries).toHaveLength(2);
		expect(entries[0]).toEqual({
			$type: ADDRESS_TYPE,
			name: 'Humboldt Park',
			locality: 'Chicago',
			region: 'Illinois',
			country: 'US'
		});
		expect(entries[1]).toEqual({
			$type: GEO_TYPE,
			latitude: '41.9027884',
			longitude: '-87.7209107'
		});
		expect(typeof (entries[1] as Record<string, unknown>).latitude).toBe('string');
	});

	it('street entry keeps the road name alongside its fields, plus a geo entry', () => {
		// The name is stored even though it restates `street`. Readers de-duplicate
		// it (dropRepeats), and they must anyway for records other clients wrote.
		const entries = buildLocationEntries(geocodeResponseToLocation(ROAD));
		expect(entries[0]).toMatchObject({
			$type: ADDRESS_TYPE,
			name: '5th Avenue',
			street: '5th Avenue',
			country: 'US'
		});
		expect(entries[1]).toMatchObject({ $type: GEO_TYPE });
	});

	it('omits the geo entry when the location has no coordinates', () => {
		const entries = buildLocationEntries({ locality: 'Nowhere', country: 'US' });
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ $type: ADDRESS_TYPE });
	});

	it('emits ONLY the geo entry for a coordinates-only location (no empty address)', () => {
		// An empty address entry would be lexicon-invalid (country is required).
		const entries = buildLocationEntries({ coords: { lat: 41.9, lng: -87.7 } });
		expect(entries).toEqual([{ $type: GEO_TYPE, latitude: '41.9', longitude: '-87.7' }]);
	});

	it('keeps a country-less address entry even when there are coordinates too', () => {
		// `country` is required by the address lexicon, so this entry is incomplete.
		// It is still written, because the alternative deletes the town: the geo entry
		// has a `name` and no field for a locality or a region. Compare the no-coords
		// case below — the SAME location, and the town used to survive there and
		// vanish here, decided by whether a point came along with it.
		expect(
			buildLocationEntries({
				name: 'Humboldt Park',
				locality: 'Chicago',
				region: 'Illinois',
				coords: { lat: 41.9027884, lng: -87.7209107 }
			})
		).toEqual([
			{
				$type: ADDRESS_TYPE,
				name: 'Humboldt Park',
				locality: 'Chicago',
				region: 'Illinois'
			},
			{
				$type: GEO_TYPE,
				latitude: '41.9027884',
				longitude: '-87.7209107'
			}
		]);
	});

	it('puts the name on the address entry, never on both', () => {
		// The geo entry's `name` is the fallback for a pick with no address fields at
		// all. Once an address entry exists it owns the name, so no reader has to pick
		// between two copies that an edit could let drift apart.
		const entries = buildLocationEntries({
			name: 'Alinea',
			street: '1723 North Halsted Street',
			locality: 'Chicago',
			region: 'Illinois',
			coords: { lat: 41.9134, lng: -87.6487 }
		});
		expect(entries.filter((e) => 'name' in e)).toEqual([
			{
				$type: ADDRESS_TYPE,
				name: 'Alinea',
				street: '1723 North Halsted Street',
				locality: 'Chicago',
				region: 'Illinois'
			}
		]);
	});

	it('never writes a country NAME to the country field', () => {
		// The lexicon field is "The ISO 3166 country code. Preferably the 2-letter
		// code", 2 to 10 bytes. A URL import maps schema.org addressCountry straight
		// through, so "United States" reached this function verbatim, and it is both
		// the wrong kind of value and 13 bytes against a maxLength of 10. The entry is
		// still written; only the unusable field is left off.
		expect(
			buildLocationEntries({
				street: '1723 N Halsted',
				locality: 'Chicago',
				country: 'United States'
			})
		).toEqual([{ $type: ADDRESS_TYPE, street: '1723 N Halsted', locality: 'Chicago' }]);
		// Short enough to fit maxLength, still not a code.
		expect(buildLocationEntries({ locality: 'Paris', country: 'France' })).toEqual([
			{ $type: ADDRESS_TYPE, locality: 'Paris' }
		]);
	});

	it('normalizes a lowercase code and keeps a real one', () => {
		expect(buildLocationEntries({ locality: 'Chicago', country: 'us' })).toEqual([
			{ $type: ADDRESS_TYPE, locality: 'Chicago', country: 'US' }
		]);
	});

	it('emits no address entry when an unusable country was its only field', () => {
		// hasAddressFields has to test the NORMALIZED country, or this writes an entry
		// carrying nothing but its $type.
		expect(buildLocationEntries({ country: 'United States' })).toEqual([]);
		expect(buildLocationEntries({ name: 'Somewhere', country: 'France' })).toEqual([]);
	});

	it('keeps a country-less address when there are no coordinates to carry it', () => {
		// Nothing else can hold the location, so an incomplete address beats none:
		// dropping it silently destroys a location the user can see in the editor.
		expect(buildLocationEntries({ name: 'Humboldt Park', locality: 'Chicago' })).toEqual([
			{ $type: ADDRESS_TYPE, name: 'Humboldt Park', locality: 'Chicago' }
		]);
	});

	it('keeps an imported location that carries a street and nothing else', () => {
		// The regression this guards: an .ics import sets `street` only, and a JSON-LD
		// import omits the country whenever the page has no addressCountry. Gating the
		// address entry on `country` dropped both on save, so an imported event the
		// user could see in the editor saved with no location at all.
		expect(buildLocationEntries({ street: 'The Empty Bottle, 1035 N Western Ave' })).toEqual([
			{ $type: ADDRESS_TYPE, street: 'The Empty Bottle, 1035 N Western Ave' }
		]);
		expect(
			buildLocationEntries({ street: '1035 N Western Ave', locality: 'Chicago', region: 'IL' })
		).toEqual([
			{ $type: ADDRESS_TYPE, street: '1035 N Western Ave', locality: 'Chicago', region: 'IL' }
		]);
	});

	it('never puts the name on BOTH entries', () => {
		const entries = buildLocationEntries(geocodeResponseToLocation(PARK));
		expect(entries[0].name).toBe('Humboldt Park');
		expect('name' in entries[1]).toBe(false);
	});

	it('emits a country-only address entry (country alone is a valid address)', () => {
		expect(buildLocationEntries({ country: 'US' })).toEqual([
			{ $type: ADDRESS_TYPE, country: 'US' }
		]);
	});

	it('never emits a geo entry for out-of-range or non-finite coords (e.g. from a prefill)', () => {
		// buildLocationEntries is the final gate — coords can arrive straight from a
		// public EventEditorPrefill without passing the geocode/hydration validation.
		for (const coords of [
			{ lat: 91, lng: -87.7 },
			{ lat: 41.9, lng: -200 },
			{ lat: Number.NaN, lng: 10 }
		]) {
			expect(buildLocationEntries({ locality: 'Chicago', country: 'US', coords })).toEqual([
				{ $type: ADDRESS_TYPE, locality: 'Chicago', country: 'US' }
			]);
		}
	});
});

describe('getLocationDisplayString — what the editor shows', () => {
	it('leads with the place name', () => {
		expect(getLocationDisplayString(geocodeResponseToLocation(PARK))).toBe(
			'Humboldt Park, Chicago, Illinois, US'
		);
	});

	it('does not repeat a name that is also one of the fields', () => {
		// Picking a CITY gives a result whose name IS its locality, and picking a road
		// one whose name is its street, so joining name and fields blindly rendered
		// "Chicago, Chicago, Illinois, US" — in the search results the user picks from
		// AND in the selected-location block. The card for the same pick showed
		// "Chicago, Illinois", because the readers de-duplicate. Same rule here now.
		expect(getLocationDisplayString(geocodeResponseToLocation(CITY))).toBe('Chicago, Illinois, US');
		expect(
			getLocationDisplayString({
				name: 'North Halsted Street',
				street: 'North Halsted Street',
				locality: 'Chicago',
				region: 'Illinois',
				country: 'US'
			})
		).toBe('North Halsted Street, Chicago, Illinois, US');
	});

	it('keeps a field the name only mentions in passing', () => {
		// Whole-segment matching, so a name CONTAINING the word does not swallow it.
		expect(
			getLocationDisplayString({ name: 'Paris Street Cafe', locality: 'Paris', country: 'FR' })
		).toBe('Paris Street Cafe, Paris, FR');
	});

	it('shows the place name for a location saved with coordinates only', () => {
		expect(
			getLocationDisplayString({ name: 'Humboldt Park', coords: { lat: 41.9, lng: -87.7 } })
		).toBe('Humboldt Park');
	});

	it('falls back to the coordinates when there is no name or address either', () => {
		// Would otherwise render as an empty label with a remove button next to it.
		expect(getLocationDisplayString({ coords: { lat: 41.9027884, lng: -87.7209107 } })).toBe(
			'41.90279, -87.72091'
		);
	});

	it('is empty for a location with nothing in it', () => {
		expect(getLocationDisplayString({})).toBe('');
	});

	it('is empty for a bare 0,0 sentinel', () => {
		// The editor was the last reader still rendering the sentinel as a position:
		// cards, the event page, the map link and both calendar exports had stopped, so
		// an owner opening a live sentinel-bearing record saw "0.00000, 0.00000" where
		// everyone else saw no location. LocationSection keys its block off this string,
		// so '' renders the "Add location" button rather than an empty label.
		expect(getLocationDisplayString({ coords: { lat: 0, lng: 0 } })).toBe('');
	});

	it('still shows a sentinel-bearing location by its name or address', () => {
		// Only the POINT is untrustworthy. A record carrying 0,0 beside a real place
		// still has a place to show, and hiding that would lose the user their location.
		expect(getLocationDisplayString({ name: 'Somewhere', coords: { lat: 0, lng: 0 } })).toBe(
			'Somewhere'
		);
		expect(
			getLocationDisplayString({
				locality: 'Albuquerque',
				country: 'US',
				coords: { lat: 0, lng: 0 }
			})
		).toBe('Albuquerque, US');
	});

	it('shows a point that is zero on ONE axis', () => {
		// The equator and the prime meridian both run through inhabited land; only the
		// pair is the sentinel. A guard written as `!lat || !lng` would hide these.
		expect(getLocationDisplayString({ coords: { lat: 0, lng: 12.56891 } })).toBe(
			'0.00000, 12.56891'
		);
		expect(getLocationDisplayString({ coords: { lat: 55.67606, lng: 0 } })).toBe(
			'55.67606, 0.00000'
		);
	});
});

describe('hiding the 0,0 sentinel must not DELETE it', () => {
	// The display bound and the write bound are deliberately different: readers refuse
	// to state the sentinel, but the editor must not destroy a stored entry just
	// because it declines to draw it. These pin that separation — if someone
	// "simplifies" the writers onto coordsUsableForDisplay, an edit to an unrelated
	// field would silently drop a live record's geo entry.
	const sentinelRecord = [{ $type: GEO_TYPE, latitude: '0', longitude: '0' }];

	it('still reads the sentinel back into the editor model', () => {
		expect(eventLocationFromEntries(sentinelRecord)).toEqual({ coords: { lat: 0, lng: 0 } });
	});

	it('still writes the sentinel when the location is rebuilt', () => {
		expect(buildLocationEntries({ coords: { lat: 0, lng: 0 } })).toEqual([
			{ $type: GEO_TYPE, latitude: '0', longitude: '0' }
		]);
	});

	it('preserves the stored entry through a save that did not touch the location', () => {
		// The path an owner actually takes: open a sentinel-bearing event, see no
		// location (correct), change the title, save. The entry must survive untouched.
		expect(
			locationsForSave({
				isNew: false,
				locationChanged: false,
				location: eventLocationFromEntries(sentinelRecord),
				existing: sentinelRecord
			})
		).toEqual(sentinelRecord);
	});

	it('replaces the sentinel when the owner picks a real place', () => {
		const picked = geocodeResponseToLocation(PARK);
		const written = locationsForSave({
			isNew: false,
			locationChanged: true,
			location: picked,
			existing: sentinelRecord
		});
		expect(written).toEqual(buildLocationEntries(picked));
		expect(written).not.toContainEqual({ $type: GEO_TYPE, latitude: '0', longitude: '0' });
	});
});

describe('eventLocationFromEntries — record -> EventLocation (round-trip)', () => {
	it('recovers the address fields AND the coordinates a saved event carries', () => {
		const original = geocodeResponseToLocation(PARK);
		const roundTripped = eventLocationFromEntries(buildLocationEntries(original));
		expect(roundTripped).toEqual(original);
		// The coords specifically survive — the recurring-event path depends on it.
		expect(roundTripped.coords).toEqual({ lat: 41.9027884, lng: -87.7209107 });
	});

	it('recovers coordinates from an existing geo entry with string lat/lng', () => {
		const loc = eventLocationFromEntries([
			{ $type: ADDRESS_TYPE, name: 'Old Venue', locality: 'Chicago', country: 'US' },
			{ $type: GEO_TYPE, latitude: '41.9', longitude: '-87.7' }
		]);
		expect(loc).toEqual({
			name: 'Old Venue',
			locality: 'Chicago',
			country: 'US',
			coords: { lat: 41.9, lng: -87.7 }
		});
	});

	it('handles an address-only record (no geo) and an empty/absent list', () => {
		expect(
			eventLocationFromEntries([{ $type: ADDRESS_TYPE, locality: 'Chicago', country: 'US' }])
		).toEqual({ locality: 'Chicago', country: 'US' });
		expect(eventLocationFromEntries([])).toEqual({});
		expect(eventLocationFromEntries(undefined)).toEqual({});
	});

	it('recovers the name AND coordinates from a geo-only record (no address entry)', () => {
		// That is how a pick the geocoder gave no country code for is stored, so
		// dropping it here would lose both the name and the _geo on the next re-save.
		expect(
			eventLocationFromEntries([
				{ $type: GEO_TYPE, latitude: '41.9', longitude: '-87.7', name: 'Humboldt Park' }
			])
		).toEqual({ name: 'Humboldt Park', coords: { lat: 41.9, lng: -87.7 } });
	});

	it('prefers the address entry name over a geo entry name', () => {
		const loc = eventLocationFromEntries([
			{ $type: ADDRESS_TYPE, name: 'From Address', country: 'US' },
			{ $type: GEO_TYPE, latitude: '41.9', longitude: '-87.7', name: 'From Geo' }
		]);
		expect(loc.name).toBe('From Address');
	});

	it('round-trips a country-less pick through the record and back WITHOUT losing the town', () => {
		// A free-text country is not a storable ISO code, so this pick has none — the
		// case that used to be written as a geo entry alone. Everything the picker
		// showed comes back: reopening the editor, the card and the calendar export
		// all still have Chicago. This assertion is the whole point of writing the
		// incomplete address entry rather than dropping it.
		const original = geocodeResponseToLocation({
			...PARK,
			address: { suburb: 'Humboldt Park', city: 'Chicago', country: 'United States' }
		});
		expect(original.country).toBeUndefined();
		expect(eventLocationFromEntries(buildLocationEntries(original))).toEqual(original);
	});

	it('ignores entry kinds this editor does not author (FSQ/H3)', () => {
		expect(
			eventLocationFromEntries([
				{ $type: 'community.lexicon.location.fsq', fsq_place_id: 'abc' },
				{ $type: 'community.lexicon.location.hthree', value: '8a2a1072b59ffff' }
			])
		).toEqual({});
	});

	it('rejects blank/whitespace coordinate strings (no Null Island)', () => {
		const loc = eventLocationFromEntries([
			{ $type: ADDRESS_TYPE, locality: 'Chicago', country: 'US' },
			{ $type: GEO_TYPE, latitude: '', longitude: ' ' }
		]);
		expect(loc.coords).toBeUndefined();
		expect(loc.locality).toBe('Chicago');
	});

	it('rejects out-of-range coordinates', () => {
		const loc = eventLocationFromEntries([
			{ $type: ADDRESS_TYPE, locality: 'Chicago', country: 'US' },
			{ $type: GEO_TYPE, latitude: '91.5', longitude: '-200' }
		]);
		expect(loc.coords).toBeUndefined();
	});
});

describe('locationsForSave — which locations[] a save/recurrence writes', () => {
	const CHANGED: EventLocation = {
		name: 'Humboldt Park',
		locality: 'Chicago',
		country: 'US',
		coords: { lat: 41.9027884, lng: -87.7209107 }
	};
	// Address + a kind this editor does not model (FSQ), plus a foreign entry: what a
	// re-save or a recurrence with an UNCHANGED location must carry through intact.
	const EXISTING = [
		{ $type: ADDRESS_TYPE, name: 'Old Venue', locality: 'Chicago', country: 'US' },
		{ $type: 'community.lexicon.location.fsq', fsq_place_id: 'abc' },
		{ $type: 'community.example.unknown.v1', foo: 'bar' }
	];

	it('rebuilds from the edited model on a new event', () => {
		expect(
			locationsForSave({
				isNew: true,
				locationChanged: true,
				location: CHANGED,
				existing: undefined
			})
		).toEqual(buildLocationEntries(CHANGED));
	});

	it('rebuilds from the edited model on an explicit location change', () => {
		expect(
			locationsForSave({
				isNew: false,
				locationChanged: true,
				location: CHANGED,
				existing: EXISTING
			})
		).toEqual(buildLocationEntries(CHANGED));
	});

	it('preserves the existing entries WHOLESALE when the location is unchanged', () => {
		// The FSQ and foreign entries survive — this is the recurrence-drops-FSQ fix,
		// and the parity with the plain save path.
		const result = locationsForSave({
			isNew: false,
			locationChanged: false,
			location: CHANGED,
			existing: EXISTING
		});
		expect(result).toEqual(EXISTING);
	});

	it('returns a COPY, not the original array or its entries', () => {
		const result = locationsForSave({
			isNew: false,
			locationChanged: false,
			location: null,
			existing: EXISTING
		});
		expect(result).not.toBe(EXISTING);
		expect(result?.[0]).not.toBe(EXISTING[0]);
		expect(result).toEqual(EXISTING);
	});

	it('returns undefined for a removed location or an unchanged event with no field', () => {
		expect(
			locationsForSave({ isNew: false, locationChanged: true, location: null, existing: EXISTING })
		).toBeUndefined();
		expect(
			locationsForSave({
				isNew: false,
				locationChanged: false,
				location: null,
				existing: undefined
			})
		).toBeUndefined();
	});

	it('preserves an unchanged empty locations array', () => {
		expect(
			locationsForSave({ isNew: false, locationChanged: false, location: null, existing: [] })
		).toEqual([]);
	});
});

describe('mapper and serializer agree on what will persist', () => {
	// The claim the mapper documents: it decides a name's redundancy from the same
	// condition the serializer emits an address entry on. A house number with no
	// road is the input where the two used to part company — the mapper counted it
	// as a field that would persist, the serializer could not write it.
	it('does not treat a house number with no road as a surviving address field', () => {
		const location = geocodeResponseToLocation({
			name: 'Rose Cottage',
			category: 'place',
			placeType: 'house',
			address: { house_number: '7' }
		});
		expect(location).toEqual({ name: 'Rose Cottage' });
		// Nothing lexicon-valid can be written: no country for an address entry, no
		// coordinates for a geo entry. The point is that the mapper agrees.
		expect(buildLocationEntries(location)).toEqual([]);
	});

	it('still keeps the place identity when that same pick has coordinates', () => {
		const location = geocodeResponseToLocation({
			name: 'Rose Cottage',
			category: 'place',
			placeType: 'house',
			address: { house_number: '7' },
			lat: 51.5,
			lng: -0.1
		});
		expect(buildLocationEntries(location)).toEqual([
			{
				$type: GEO_TYPE,
				latitude: '51.5',
				longitude: '-0.1',
				name: 'Rose Cottage'
			}
		]);
	});
});

describe('a named feature that only looks like a road', () => {
	it('keeps the name of a racing circuit', () => {
		// highway/raceway sits beside the road types but is a motor-racing circuit:
		// the name is the venue picked, not a street. Treating it as a road made
		// "Indianapolis Motor Speedway" save as "Speedway, Indiana".
		expect(
			geocodeResponseToLocation({
				name: 'Indianapolis Motor Speedway',
				category: 'highway',
				placeType: 'raceway',
				address: {
					road: 'Indianapolis Motor Speedway',
					city: 'Speedway',
					state: 'Indiana',
					country_code: 'us'
				},
				lat: 39.795,
				lng: -86.234
			}).name
		).toBe('Indianapolis Motor Speedway');
	});
});
