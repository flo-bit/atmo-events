import { describe, expect, it } from 'vitest';
// The pulled lexicons are the contract the emitted record has to satisfy, so
// validate against the JSON itself rather than a hand-copied version of it: if a
// constraint changes upstream, `pnpm generate:pull` brings the change in here and
// this test fails instead of silently passing.
import ADDRESS_LEXICON from '../../lexicons/pulled/community/lexicon/location/address.json';
import GEO_LEXICON from '../../lexicons/pulled/community/lexicon/location/geo.json';
// The REAL editor builder (the write side). A relative path into the sibling
// workspace package's SOURCE, because packages/ui resolves to its built dist and
// tests run without a build (the same cross-package reference apps/web/src/app.css
// already makes).
import {
	buildLocationEntries,
	geocodeResponseToLocation,
	type GeocodeResponse
} from '../../../../packages/ui/src/editor/location';

interface LexiconProperty {
	type: string;
	maxLength?: number;
	minLength?: number;
}
interface LexiconDoc {
	id: string;
	defs: { main: { required?: string[]; properties: Record<string, LexiconProperty> } };
}

const LEXICONS = [ADDRESS_LEXICON, GEO_LEXICON] as unknown as LexiconDoc[];

/**
 * Check one emitted `locations[]` entry against the lexicon its `$type` names.
 * Covers what these two lexicons actually constrain: required properties, unknown
 * properties, string typing, and min/max length. Lengths are measured in UTF-8
 * bytes, which is what a lexicon `maxLength` counts.
 */
function lexiconErrors(entry: Record<string, unknown>): string[] {
	const doc = LEXICONS.find((l) => l.id === entry.$type);
	if (!doc) return [`unknown $type: ${String(entry.$type)}`];

	const { required = [], properties } = doc.defs.main;
	const errors: string[] = [];

	for (const key of required) {
		if (entry[key] === undefined) errors.push(`${doc.id}: missing required "${key}"`);
	}

	for (const [key, value] of Object.entries(entry)) {
		if (key === '$type') continue;
		const property = properties[key];
		if (!property) {
			errors.push(`${doc.id}: unknown property "${key}"`);
			continue;
		}
		if (property.type !== 'string') continue;
		if (typeof value !== 'string') {
			errors.push(`${doc.id}: "${key}" must be a string, got ${typeof value}`);
			continue;
		}
		const bytes = new TextEncoder().encode(value).length;
		if (property.maxLength !== undefined && bytes > property.maxLength) {
			errors.push(`${doc.id}: "${key}" is ${bytes} bytes, over maxLength ${property.maxLength}`);
		}
		if (property.minLength !== undefined && bytes < property.minLength) {
			errors.push(`${doc.id}: "${key}" is ${bytes} bytes, under minLength ${property.minLength}`);
		}
	}

	return errors;
}

// Representative normalized /api/geocoding responses, one per shape the picker
// can hand the mapper. Each must produce a conforming record. This is a sample of
// geocoder outputs, not a proof over every possible buildLocationEntries input.
const PICKS: Array<[what: string, response: GeocodeResponse]> = [
	[
		'a named area (the #38 repro)',
		{
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
		}
	],
	[
		'a POI with a street address',
		{
			lat: 41.9134,
			lng: -87.6487,
			label: 'Alinea, 1723, North Halsted Street, Chicago, Illinois, 60614, United States',
			name: 'Alinea',
			category: 'amenity',
			placeType: 'restaurant',
			address: {
				house_number: '1723',
				road: 'North Halsted Street',
				city: 'Chicago',
				state: 'Illinois',
				country_code: 'us',
				country: 'United States'
			}
		}
	],
	[
		'a city (no place name kept)',
		{
			lat: 41.8755616,
			lng: -87.6244212,
			label: 'Chicago, Cook County, Illinois, United States',
			name: 'Chicago',
			category: 'boundary',
			placeType: 'administrative',
			address: { city: 'Chicago', state: 'Illinois', country_code: 'us', country: 'United States' }
		}
	],
	[
		'a country whose NAME would overflow the 10-char country cap',
		{
			lat: 51.5,
			lng: -0.12,
			label: 'United Kingdom of Great Britain and Northern Ireland',
			name: 'United Kingdom',
			category: 'boundary',
			placeType: 'administrative',
			address: {
				country_code: 'gb',
				country: 'United Kingdom of Great Britain and Northern Ireland'
			}
		}
	],
	[
		'a pick the geocoder gave no ISO country code for',
		{
			lat: 41.9027884,
			lng: -87.7209107,
			label: 'Humboldt Park, Chicago, Illinois, United States',
			name: 'Humboldt Park',
			category: 'place',
			placeType: 'suburb',
			address: { suburb: 'Humboldt Park', city: 'Chicago', country: 'United States' }
		}
	],
	[
		'a pick with no address at all',
		{ lat: 41.9027884, lng: -87.7209107, label: '41.9027884, -87.7209107', address: {} }
	],
	[
		'a named POI whose country code is malformed',
		{
			lat: 41.9134,
			lng: -87.6487,
			label: 'Alinea, Chicago',
			name: 'Alinea',
			category: 'amenity',
			placeType: 'restaurant',
			address: { city: 'Chicago', country_code: 'United States' }
		}
	]
];

/** The ONE deviation from the lexicons this writer knowingly makes. `country` is
 *  required on the address entry, and when the geocoder gives no ISO code there is
 *  none to write — but the entry is still emitted, because the alternative is
 *  deleting the street, locality and region with it, permanently, from a record
 *  nothing will rewrite. The geo entry cannot take them: it has a `name` and no
 *  field for a town. Anything OTHER than this string is a real defect, so the
 *  checker stays strict and the tests subtract exactly this one error. */
const MISSING_COUNTRY = `${ADDRESS_LEXICON.id}: missing required "country"`;

describe('emitted locations[] conforms to the pulled location lexicons', () => {
	for (const [what, response] of PICKS) {
		it(`validates the entries emitted for ${what}`, () => {
			const entries = buildLocationEntries(geocodeResponseToLocation(response));
			expect(entries.length).toBeGreaterThan(0);
			for (const entry of entries) {
				const errors = lexiconErrors(entry).filter((e) => e !== MISSING_COUNTRY);
				expect(errors, JSON.stringify(entry)).toEqual([]);
			}
		});
	}

	it('omits country ONLY when the geocoder gave no ISO code to write', () => {
		// The deviation has to be forced, not incidental: every address entry that
		// lacks `country` must come from a response that carried no usable code. A
		// pick whose code we could read and simply failed to store would fail here.
		for (const [what, response] of PICKS) {
			const location = geocodeResponseToLocation(response);
			for (const entry of buildLocationEntries(location)) {
				if (entry.$type !== ADDRESS_LEXICON.id) continue;
				if (typeof entry.country === 'string') continue;
				expect(location.country, `${what}: dropped a country it could resolve`).toBeUndefined();
			}
		}
	});

	it('keeps the town on the incomplete address entry rather than dropping it', () => {
		// A free-text country is not a storable ISO code. The address entry goes out
		// missing its one required field, carrying everything else the picker showed,
		// beside a fully valid geo entry — so the record loses conformance on one
		// field instead of losing Chicago outright.
		const entries = buildLocationEntries(
			geocodeResponseToLocation({
				lat: 41.9027884,
				lng: -87.7209107,
				name: 'Humboldt Park',
				category: 'place',
				placeType: 'suburb',
				address: { suburb: 'Humboldt Park', city: 'Chicago', country: 'United States' }
			})
		);
		expect(entries).toEqual([
			{ $type: ADDRESS_LEXICON.id, name: 'Humboldt Park', locality: 'Chicago' },
			{ $type: GEO_LEXICON.id, latitude: '41.9027884', longitude: '-87.7209107' }
		]);
		expect(lexiconErrors(entries[0])).toEqual([MISSING_COUNTRY]);
		expect(lexiconErrors(entries[1])).toEqual([]);
	});

	it('still carries the place name on the geo entry when there is no address at all', () => {
		// The geo entry's optional `name` remains the home for a pick with nothing
		// structured to put in an address entry — a place in international waters, or
		// any result whose only address keys are ones the mapper does not read.
		const entries = buildLocationEntries(
			geocodeResponseToLocation({
				lat: -48.876667,
				lng: -123.393333,
				name: 'Point Nemo',
				category: 'place',
				placeType: 'locality',
				address: { locality: 'Point Nemo' }
			})
		);
		expect(entries).toEqual([
			{
				$type: GEO_LEXICON.id,
				latitude: '-48.876667',
				longitude: '-123.393333',
				name: 'Point Nemo'
			}
		]);
		expect(lexiconErrors(entries[0])).toEqual([]);
	});
});

describe('the lexicon checker itself', () => {
	// Without these the suite above could pass by never actually checking anything.
	it('reports a missing required property', () => {
		expect(lexiconErrors({ $type: ADDRESS_LEXICON.id, locality: 'Chicago' })).toEqual([
			`${ADDRESS_LEXICON.id}: missing required "country"`
		]);
		expect(lexiconErrors({ $type: GEO_LEXICON.id, latitude: '41.9' })).toEqual([
			`${GEO_LEXICON.id}: missing required "longitude"`
		]);
	});

	it('reports a country name that overflows maxLength, and a code under minLength', () => {
		expect(lexiconErrors({ $type: ADDRESS_LEXICON.id, country: 'United States' })).toEqual([
			`${ADDRESS_LEXICON.id}: "country" is 13 bytes, over maxLength 10`
		]);
		expect(lexiconErrors({ $type: ADDRESS_LEXICON.id, country: 'U' })).toEqual([
			`${ADDRESS_LEXICON.id}: "country" is 1 bytes, under minLength 2`
		]);
	});

	it('reports numeric coordinates (the geo lexicon wants strings) and stray properties', () => {
		expect(lexiconErrors({ $type: GEO_LEXICON.id, latitude: 41.9, longitude: '-87.7' })).toEqual([
			`${GEO_LEXICON.id}: "latitude" must be a string, got number`
		]);
		expect(lexiconErrors({ $type: ADDRESS_LEXICON.id, country: 'US', osmId: '123' })).toEqual([
			`${ADDRESS_LEXICON.id}: unknown property "osmId"`
		]);
	});

	it('reports an entry whose $type is not a known location lexicon', () => {
		expect(lexiconErrors({ $type: 'community.lexicon.location.fsq' })).toEqual([
			'unknown $type: community.lexicon.location.fsq'
		]);
	});
});
