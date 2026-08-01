import { describe, expect, it } from 'vitest';
import { getLocationData } from './format';
import type { FlatEventRecord } from '../contrail.js';

const locations = (entries: Array<Record<string, unknown>>) =>
	entries as unknown as FlatEventRecord['locations'];

const ADDRESS = 'community.lexicon.location.address';
const GEO = 'community.lexicon.location.geo';

describe('getLocationData', () => {
	it('reads the address entry, leading with its name', () => {
		const data = getLocationData(
			locations([
				{
					$type: ADDRESS,
					name: 'Humboldt Park',
					locality: 'Chicago',
					region: 'Illinois',
					country: 'US'
				},
				{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107' }
			])
		);
		expect(data?.name).toBe('Humboldt Park');
		expect(data?.fullAddress).toBe('Chicago, Illinois, US');
		expect(data?.fullString).toBe('Humboldt Park, Chicago, Illinois, US');
	});

	it('falls back to a named geo entry when there is no address entry', () => {
		// A pick the geocoder gave no ISO country code for is saved as a geo entry
		// alone (the address lexicon requires a country). Without this the event view
		// showed no location at all for such a pick.
		const data = getLocationData(
			locations([
				{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107', name: 'Humboldt Park' }
			])
		);
		expect(data?.name).toBe('Humboldt Park');
		expect(data?.fullString).toBe('Humboldt Park');
		expect(data?.shortAddress).toBe('');
		// The map link points at the coordinates, which are better than the bare name.
		expect(data?.googleMapsUrl).toContain(encodeURIComponent('41.9027884,-87.7209107'));
	});

	it('shows the point for an unnamed geo-only record', () => {
		// It has a position, so rendering nothing would hide a location the editor
		// displays. Same form the editor uses for the same record.
		const data = getLocationData(locations([{ $type: GEO, latitude: '41.9', longitude: '-87.7' }]));
		expect(data?.fullString).toBe('41.90000, -87.70000');
		expect(data?.name).toBeUndefined();
		expect(data?.googleMapsUrl).toContain(encodeURIComponent('41.9,-87.7'));
	});

	it('does not repeat a name that is also its own street', () => {
		// The picker keeps the name of a pedestrian way on purpose, so name and street
		// can be the same string. Without de-duplication the page rendered "Rocky
		// Steps, Rocky Steps, Philadelphia" and searched Google Maps for it too.
		const data = getLocationData(
			locations([
				{
					$type: ADDRESS,
					name: 'Rocky Steps',
					street: 'Rocky Steps',
					locality: 'Philadelphia',
					region: 'Pennsylvania',
					country: 'US'
				}
			])
		);
		expect(data?.fullString).toBe('Rocky Steps, Philadelphia, Pennsylvania, US');
		expect(data?.shortAddress).toBe('Philadelphia');
		expect(data?.fullAddress).toBe('Philadelphia, Pennsylvania, US');
	});

	it('keeps a city that shares its state name', () => {
		// Not a repetition: Berlin the city sits in Berlin the state, the same way
		// New York does. Collapsing it would make the place more ambiguous, so only
		// the NAME is de-duplicated against the fields, never the fields against
		// each other.
		const data = getLocationData(
			locations([
				{ $type: ADDRESS, name: 'Funkhaus', locality: 'Berlin', region: 'Berlin', country: 'DE' }
			])
		);
		expect(data?.fullString).toBe('Funkhaus, Berlin, Berlin, DE');
	});

	it('keeps the geocoding query un-de-duplicated', () => {
		// Display drops a field the name restates; a geocoder must NOT get that string.
		// "Rådhuspladsen, DK" has lost the city that disambiguates the street, while
		// the displayed label still reads correctly.
		const data = getLocationData(
			locations([
				{
					$type: ADDRESS,
					name: 'Copenhagen',
					street: 'Rådhuspladsen',
					locality: 'Copenhagen',
					country: 'DK'
				}
			])
		);
		expect(data?.fullAddress).toBe('Rådhuspladsen, DK');
		expect(data?.geocodeQuery).toBe('Rådhuspladsen, Copenhagen, DK');
	});

	it('map-links the point, not the address text, when it has one', () => {
		// Text is re-geocoded by Google and can land on a different feature of the same
		// name: a Copenhagen record aimed at the city square resolved to the train
		// station. The stored point cannot misresolve.
		const data = getLocationData(
			locations([
				{ $type: ADDRESS, name: 'Copenhagen', street: 'Rådhuspladsen', country: 'DK' },
				{ $type: GEO, latitude: '55.67606', longitude: '12.56891' }
			])
		);
		expect(data?.fullString).toBe('Copenhagen, Rådhuspladsen, DK');
		expect(data?.googleMapsUrl).toContain(encodeURIComponent('55.67606,12.56891'));
		expect(data?.googleMapsUrl).not.toContain('dhuspladsen');
	});

	it('falls back to the address text for a 0,0 sentinel point', () => {
		// 0,0 is valid WGS84 and the conventional "no data" value; atmo has records
		// carrying it beside a perfectly good address. Linking it lands the reader in
		// the Gulf of Guinea, so the address wins.
		const data = getLocationData(
			locations([
				{
					$type: ADDRESS,
					street: '1100 Louisiana Blvd SE',
					locality: 'Albuquerque',
					country: 'US'
				},
				{ $type: GEO, latitude: '0', longitude: '0' }
			])
		);
		expect(data?.googleMapsUrl).toContain(encodeURIComponent('1100 Louisiana Blvd SE'));
		expect(data?.googleMapsUrl).not.toContain('query=0');
	});

	it('returns null for a record that is nothing but a 0,0 sentinel', () => {
		// No address text and no name, so the point is the only thing that could be
		// shown — and it is the "nobody could geocode this" value, not a position. The
		// label used to render as "0.00000, 0.00000" and, because the link falls back to
		// querying the label when it has no usable point, Google Maps searched for that
		// string and dropped the reader in the Gulf of Guinea.
		expect(getLocationData(locations([{ $type: GEO, latitude: '0', longitude: '0' }]))).toBeNull();
	});

	it('does not map-link a 0,0 sentinel that a name kept renderable', () => {
		// The name makes the record renderable, so the null return above never fires.
		// The link has to reject the point on its own and fall back to the NAME.
		const data = getLocationData(
			locations([{ $type: GEO, name: 'Somewhere', latitude: '0', longitude: '0' }])
		);
		expect(data?.fullString).toBe('Somewhere');
		expect(data?.googleMapsUrl).toBe('https://www.google.com/maps/search/?api=1&query=Somewhere');
	});

	it('does not map-link an out-of-range point that a name kept renderable', () => {
		// The name makes the record renderable, so the early return for an unusable
		// point never fires; the link still has to reject the point on its own, or a
		// record written by another client sends the user to a position off the globe.
		const data = getLocationData(
			locations([{ $type: GEO, name: 'Everest', latitude: '91', longitude: '181' }])
		);
		expect(data?.fullString).toBe('Everest');
		expect(data?.googleMapsUrl).not.toContain('91');
		expect(data?.googleMapsUrl).toContain(encodeURIComponent('Everest'));
	});

	it('returns null for a geo entry whose coordinates are not numbers', () => {
		expect(
			getLocationData(locations([{ $type: GEO, latitude: '', longitude: 'north' }]))
		).toBeNull();
	});

	it('returns null for entry kinds it cannot render', () => {
		expect(
			getLocationData(locations([{ $type: 'community.lexicon.location.fsq', fsq_place_id: 'x' }]))
		).toBeNull();
		expect(getLocationData(locations([]))).toBeNull();
		expect(getLocationData(undefined)).toBeNull();
	});
});
