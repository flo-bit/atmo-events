import { describe, expect, it } from 'vitest';
import {
	formatPoint,
	locationFullLabel,
	locationShortLabel,
	locationShortParts,
	locationSummary
} from './location-summary';

const ADDRESS = 'community.lexicon.location.address';
const GEO = 'community.lexicon.location.geo';

describe('locationSummary', () => {
	it('reads an address entry, with its name', () => {
		expect(
			locationSummary([
				{
					$type: ADDRESS,
					name: 'Humboldt Park',
					locality: 'Chicago',
					region: 'Illinois',
					country: 'US'
				}
			])
		).toEqual({ name: 'Humboldt Park', locality: 'Chicago', region: 'Illinois', country: 'US' });
	});

	it('folds the companion geo entry coordinates in', () => {
		const summary = locationSummary([
			{ $type: ADDRESS, locality: 'Chicago', country: 'US' },
			{ $type: GEO, latitude: '41.9', longitude: '-87.7' }
		]);
		expect(summary).toEqual({ locality: 'Chicago', country: 'US', lat: '41.9', lng: '-87.7' });
	});

	it('falls back to the geo entry name when there is no address entry', () => {
		// The countryless pick's shape — the datum every non-full-page reader used to
		// miss because it only looked at the address entry.
		expect(
			locationSummary([{ $type: GEO, name: 'Humboldt Park', latitude: '41.9', longitude: '-87.7' }])
		).toEqual({ name: 'Humboldt Park', lat: '41.9', lng: '-87.7' });
	});

	it('prefers the address entry name over the geo entry name', () => {
		const summary = locationSummary([
			{ $type: ADDRESS, name: 'From Address', country: 'US' },
			{ $type: GEO, name: 'From Geo', latitude: '41.9', longitude: '-87.7' }
		]);
		expect(summary?.name).toBe('From Address');
	});

	it('ignores blank strings', () => {
		expect(
			locationSummary([{ $type: ADDRESS, name: '   ', locality: 'Chicago', country: 'US' }])
		).toEqual({ locality: 'Chicago', country: 'US' });
	});

	it('returns null when there is nothing to show', () => {
		// A geo entry with only coordinates (no name) yields lat/lng but no display
		// text; an FSQ/H3-only record, an empty list, and undefined yield null.
		expect(locationSummary([{ $type: GEO, latitude: '41.9', longitude: '-87.7' }])).toEqual({
			lat: '41.9',
			lng: '-87.7'
		});
		expect(
			locationSummary([{ $type: 'community.lexicon.location.fsq', fsq_place_id: 'x' }])
		).toBeNull();
		expect(locationSummary([])).toBeNull();
		expect(locationSummary(undefined)).toBeNull();
		expect(locationSummary(null)).toBeNull();
	});

	it('does not report an address entry that carries no fields', () => {
		// Assigning undefined would still create the key, which would make an empty
		// entry read as something to show.
		expect(locationSummary([{ $type: ADDRESS }])).toBeNull();
		expect(locationSummary([{ $type: ADDRESS, street: '   ' }])).toBeNull();
	});
});

describe('locationSummary — whitespace', () => {
	it('trims the values it hands back', () => {
		// Records hold hand-entered values with trailing spaces; passing them through
		// put a space before the comma in every label and map query built from them.
		const summary = locationSummary([
			{ $type: ADDRESS, name: 'Copenhagen ', street: 'Rådhuspladsen ', country: 'DK' }
		]);
		expect(summary?.name).toBe('Copenhagen');
		expect(summary?.street).toBe('Rådhuspladsen');
		expect(
			locationFullLabel([
				{ $type: ADDRESS, name: 'Copenhagen ', street: 'Rådhuspladsen ', country: 'DK' }
			])
		).toBe('Copenhagen, Rådhuspladsen, DK');
	});
});

describe('formatPoint', () => {
	it('renders a point at display precision', () => {
		expect(formatPoint('41.9027884', '-87.7209107')).toBe('41.90279, -87.72091');
	});

	it('renders nothing for a coordinate it cannot use', () => {
		expect(formatPoint('', '-87.72')).toBe('');
		expect(formatPoint('nope', '-87.72')).toBe('');
		expect(formatPoint(undefined, undefined)).toBe('');
	});
});

// The record the whole change exists for. A reader that shows "Chicago" for this
// is the original bug wearing a different hat, so both labels are pinned to it.
const HUMBOLDT = [
	{ $type: ADDRESS, name: 'Humboldt Park', locality: 'Chicago', region: 'Illinois', country: 'US' },
	{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107' }
];

describe('locationShortParts — the short label, unjoined for layout', () => {
	// A card elides the NAME and never the context, so the two have to arrive
	// separately. The invariant that keeps them honest: joining them back together
	// always reproduces locationShortLabel exactly.
	const CASES: Array<[what: string, entries: Array<Record<string, unknown>>]> = [
		[
			'a name with a town',
			[{ $type: ADDRESS, name: 'Humboldt Park', locality: 'Chicago', region: 'Illinois' }]
		],
		[
			'a whole reverse-geocoded address in the name',
			[
				{
					$type: GEO,
					latitude: '53.3911435',
					longitude: '-3.1787171',
					name: 'Soundbreathe, Rear 6, Charles Road, Hoylake, Wirral, UK'
				}
			]
		],
		['a town with no name', [{ $type: ADDRESS, locality: 'Chicago', region: 'Illinois' }]],
		['bare coordinates', [{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107' }]],
		['a name that restates its town', [{ $type: ADDRESS, name: 'Chicago', locality: 'Chicago' }]],
		['nothing showable', [{ $type: GEO, latitude: '0', longitude: '0' }]]
	];

	for (const [what, entries] of CASES) {
		it(`rejoins to exactly the short label for ${what}`, () => {
			const parts = locationShortParts(entries);
			const rejoined = parts
				? [parts.place, ...parts.context].filter(Boolean).join(', ') || undefined
				: undefined;
			expect(rejoined).toBe(locationShortLabel(entries));
		});
	}

	it('puts only the place in `place`, so eliding it cannot eat the town', () => {
		expect(
			locationShortParts([
				{
					$type: GEO,
					latitude: '53.3911435',
					longitude: '-3.1787171',
					name: 'Soundbreathe, Rear 6, Charles Road, Hoylake, Wirral, UK'
				},
				{ $type: ADDRESS, locality: 'Hoylake', region: 'Merseyside' }
			])
		).toEqual({
			// Hoylake is gone because the NAME already states it as a whole segment —
			// the same de-duplication the joined label does, applied before the split,
			// so a card cannot show the town twice either.
			place: 'Soundbreathe, Rear 6, Charles Road, Hoylake, Wirral, UK',
			context: ['Merseyside']
		});
	});

	it('falls back to the street when the record has no name', () => {
		// 696 records in the index are this shape. Before, the card read "Berlin" and
		// the street, the only thing saying where to go, was not shown anywhere.
		expect(
			locationShortParts([
				{ $type: ADDRESS, street: 'Hermannstraße 162', locality: 'Berlin', country: 'DE' }
			])
		).toEqual({ place: 'Hermannstraße 162', context: ['Berlin'] });
	});

	it('prefers a venue name over the street when the record has both', () => {
		// A name identifies the place better, and showing both fills the card.
		expect(
			locationShortParts([
				{
					$type: ADDRESS,
					name: 'Alinea',
					street: '1723 North Halsted Street',
					locality: 'Chicago',
					region: 'Illinois',
					country: 'US'
				}
			])
		).toEqual({ place: 'Alinea', context: ['Chicago', 'Illinois'] });
	});

	it('carries a bare point as context, with no name to elide', () => {
		// Nothing here is long, so the card has nothing to truncate — and truncating
		// a coordinate pair would make it wrong rather than short.
		expect(
			locationShortParts([{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107' }])
		).toEqual({ context: ['41.90279, -87.72091'] });
	});

	it('is null when there is no location to show', () => {
		expect(locationShortParts([{ $type: GEO, latitude: '0', longitude: '0' }])).toBeNull();
		expect(locationShortParts([])).toBeNull();
		expect(locationShortParts(undefined)).toBeNull();
	});
});

describe('locationShortLabel', () => {
	it('leads with the place name and adds context while it fits', () => {
		expect(locationShortLabel(HUMBOLDT)).toBe('Humboldt Park, Chicago, Illinois');
	});

	it('keeps the town even when the name is long', () => {
		// The length budget this replaced returned the name alone here, so a card
		// showed a venue with no indication of what city it was in.
		expect(
			locationShortLabel([
				{
					$type: ADDRESS,
					name: 'Old Kona Airport Park Benches on the Right',
					locality: 'Kailua-Kona',
					region: 'Hawaii',
					country: 'US'
				}
			])
		).toBe('Old Kona Airport Park Benches on the Right, Kailua-Kona, Hawaii');
	});

	it('renders a name that is really a whole address as it stands', () => {
		// The cost of not guessing, and it is deliberate. Picking the town back out of
		// a string like this means deciding which comma segment is a street and which
		// is a settlement, in every locale, across every client's free text. Measured
		// over the index, 7 records with real address fields would read better for it;
		// nothing else would, so the rule is not worth its failure modes. The fields
		// the name already states are still dropped, so nothing is said twice.
		expect(
			locationShortLabel([
				{
					$type: ADDRESS,
					name: 'Peace Portal Drive, Blaine, Whatcom County, Washington, 98231, United States',
					locality: 'Blaine',
					region: 'Washington',
					country: 'US'
				}
			])
		).toBe('Peace Portal Drive, Blaine, Whatcom County, Washington, 98231, United States');
	});

	it('shows exactly the locality/region label when the pick has no name', () => {
		expect(
			locationShortLabel([
				{ $type: ADDRESS, locality: 'Chicago', region: 'Illinois', country: 'US' }
			])
		).toBe('Chicago, Illinois');
	});

	it('reads the name off a geo entry when there is no address entry', () => {
		expect(
			locationShortLabel([
				{ $type: GEO, name: 'Humboldt Park', latitude: '41.9027884', longitude: '-87.7209107' }
			])
		).toBe('Humboldt Park');
	});

	it('shows the point for a record saved as bare coordinates', () => {
		expect(
			locationShortLabel([{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107' }])
		).toBe('41.90279, -87.72091');
	});

	it('shows nothing when there is no entry kind it can read', () => {
		expect(locationShortLabel([])).toBeUndefined();
		expect(locationShortLabel(undefined)).toBeUndefined();
		expect(locationShortLabel([{ $type: 'community.lexicon.location.fsq' }])).toBeUndefined();
		expect(locationShortLabel([{ $type: GEO, latitude: '', longitude: '' }])).toBeUndefined();
	});
});

describe('locationFullLabel', () => {
	it('keeps the name and the country, untrimmed', () => {
		expect(locationFullLabel(HUMBOLDT)).toBe('Humboldt Park, Chicago, Illinois, US');
	});

	it('does not trim a name a card would have shortened', () => {
		const name = 'Peace Portal Drive, Blaine, Whatcom County, Washington, 98231, United States';
		expect(locationFullLabel([{ $type: ADDRESS, name, country: 'US' }])).toBe(`${name}, US`);
	});

	it('shows the point for a record saved as bare coordinates', () => {
		expect(
			locationFullLabel([{ $type: GEO, latitude: '41.9027884', longitude: '-87.7209107' }])
		).toBe('41.90279, -87.72091');
	});

	it('shows nothing when there is no entry kind it can read', () => {
		expect(locationFullLabel([])).toBeUndefined();
		expect(locationFullLabel([{ $type: 'community.lexicon.location.h3' }])).toBeUndefined();
	});
});

describe('a name that already states its own context', () => {
	// Records from other clients often carry a whole reverse-geocoded string in
	// `name`, so appending the address fields back onto it repeats them.
	const CAFE = [
		{ $type: ADDRESS, name: 'Cafe, Paris', locality: 'Paris', region: 'IDF', country: 'FR' }
	];

	it('does not repeat a locality the name already carries', () => {
		expect(locationShortLabel(CAFE)).toBe('Cafe, Paris, IDF');
	});

	it('does not repeat it in the full label either', () => {
		expect(locationFullLabel(CAFE)).toBe('Cafe, Paris, IDF, FR');
	});

	it('drops a street that merely restates the name', () => {
		// A named road feature stores the name and the street as the same string.
		expect(
			locationFullLabel([
				{
					$type: ADDRESS,
					name: 'Indianapolis Motor Speedway',
					street: 'Indianapolis Motor Speedway',
					locality: 'Speedway',
					region: 'Indiana',
					country: 'US'
				}
			])
		).toBe('Indianapolis Motor Speedway, Speedway, Indiana, US');
	});

	it('matches whole segments, not substrings', () => {
		// "Paris" appears inside "Paris Street" but is not that segment, so the
		// locality is still worth showing.
		expect(
			locationShortLabel([
				{ $type: ADDRESS, name: 'Paris Street Cafe', locality: 'Paris', country: 'FR' }
			])
		).toBe('Paris Street Cafe, Paris');
	});
});

describe('formatPoint rejects a point it would be wrong to state', () => {
	it('rejects coordinates outside WGS84', () => {
		// Lexicon-valid but unusable: the editor and the search normalizer both
		// reject this, so displaying it would assert a position that cannot exist.
		expect(formatPoint('91', '181')).toBe('');
		expect(formatPoint('-91', '0')).toBe('');
		expect(formatPoint('0', '-181')).toBe('');
		expect(locationFullLabel([{ $type: GEO, latitude: '91', longitude: '181' }])).toBeUndefined();
	});

	it('rejects blank and whitespace-only coordinates', () => {
		// Number('   ') is 0, which would render Null Island as a real location.
		expect(formatPoint('   ', '   ')).toBe('');
		expect(formatPoint('', '')).toBe('');
	});

	it('still accepts the extremes of the valid range', () => {
		expect(formatPoint('90', '180')).toBe('90.00000, 180.00000');
		// Either axis alone at zero is a real place — the equator and the prime
		// meridian both run through inhabited land. Only the pair is the sentinel.
		expect(formatPoint('0', '12.56891')).toBe('0.00000, 12.56891');
		expect(formatPoint('55.67606', '0')).toBe('55.67606, 0.00000');
	});

	it('rejects the 0,0 sentinel', () => {
		// Valid WGS84 and open ocean, so it is the conventional "no data" value rather
		// than a place: a record carries it when nobody could geocode the pick. This is
		// the last-resort label, so rejecting it renders no location at all — correct,
		// because such a record HAS no position. It also keeps the label out of the map
		// link, which falls back to querying the label text when it has no point.
		expect(formatPoint('0', '0')).toBe('');
		expect(formatPoint('0.0', '-0')).toBe('');
		expect(locationFullLabel([{ $type: GEO, latitude: '0', longitude: '0' }])).toBeUndefined();
		expect(locationShortLabel([{ $type: GEO, latitude: '0', longitude: '0' }])).toBeUndefined();
	});

	it('still shows the address when a sentinel point sits beside it', () => {
		// The sentinel only costs the record its POINT. Records carrying 0,0 next to a
		// good address are live on atmo, and the address is what they are for.
		expect(
			locationFullLabel([
				{ $type: ADDRESS, locality: 'Albuquerque', country: 'US' },
				{ $type: GEO, latitude: '0', longitude: '0' }
			])
		).toBe('Albuquerque, US');
	});
});

describe('a city that shares its state, province or canton name', () => {
	// Not a repetition to collapse. "New York, New York" is how that city is
	// written, and "New York" alone could be either the city or the state, so
	// dropping half makes the place MORE ambiguous. Every record in the corpus
	// where locality equals region is this pattern — Wien, Québec, Zürich,
	// Luzern, Berlin — so the fields are never de-duplicated against each other.
	it('keeps both when locality equals region', () => {
		expect(
			locationShortLabel([
				{ $type: ADDRESS, locality: 'New York', region: 'New York', country: 'US' }
			])
		).toBe('New York, New York');
	});

	it('keeps both after a place name', () => {
		expect(
			locationShortLabel([
				{ $type: ADDRESS, name: '@c-base.org', locality: 'Berlin', region: 'Berlin', country: 'DE' }
			])
		).toBe('@c-base.org, Berlin, Berlin');
	});

	it('keeps both in the full label, which also carries the country', () => {
		expect(
			locationFullLabel([
				{ $type: ADDRESS, name: '@c-base.org', locality: 'Berlin', region: 'Berlin', country: 'DE' }
			])
		).toBe('@c-base.org, Berlin, Berlin, DE');
	});

	// The name is still de-duplicated against the fields — that repetition is real,
	// and it is the case the shared module exists for.
	it('still drops a field the NAME already states', () => {
		expect(
			locationShortLabel([
				{ $type: ADDRESS, name: 'Zürich', locality: 'Zürich', region: 'Zürich', country: 'CH' }
			])
		).toBe('Zürich');
	});
});

describe('a name written by another client, tidied before anything reads it', () => {
	// Geocoders emit a feature's own name again as the next segment when the feature
	// and its street or area share a name, and they emit empty segments and stray
	// double spaces. Both used to render verbatim in the full label.
	it('collapses a segment repeated immediately after itself', () => {
		expect(
			locationFullLabel([
				{
					$type: GEO,
					latitude: '51.8',
					longitude: '-3.0',
					name: 'Three Pools, Three Pools, Llanvetherine, Abergavenny, UK'
				}
			])
		).toBe('Three Pools, Llanvetherine, Abergavenny, UK');
	});

	it('drops empty segments and tidies the spacing around them', () => {
		expect(
			locationFullLabel([
				{
					$type: GEO,
					latitude: '51.5',
					longitude: '-2.5',
					name: '58th Bristol Scout Group,, Gadshill Road,  Bristol'
				}
			])
		).toBe('58th Bristol Scout Group, Gadshill Road, Bristol');
	});

	it('leaves a segment that recurs further along, which is not a geocoder artefact', () => {
		expect(
			locationFullLabel([
				{
					$type: GEO,
					latitude: '51.5',
					longitude: '-2.5',
					name: 'Bristol, Hereford Street, Bristol'
				}
			])
		).toBe('Bristol, Hereford Street, Bristol');
	});
});

describe('a place carrying its postal code in the same segment', () => {
	// Whole-segment matching cannot see that "CO 80123" states the region "CO", so
	// the region was appended a second time, after the country.
	it('recognises the region and does not append it again', () => {
		expect(
			locationFullLabel([
				{
					$type: ADDRESS,
					street: '4237 W. Grand Ave.',
					locality: 'Littleton',
					region: 'CO',
					country: 'US'
				},
				{
					$type: GEO,
					latitude: '39.6300995',
					longitude: '-105.0412264',
					name: '4237 W. Grand Ave., Littleton, CO 80123, US'
				}
			])
		).toBe('4237 W. Grand Ave., Littleton, CO 80123, US');
	});

	it('recognises a UK locality ahead of its postcode', () => {
		expect(
			locationFullLabel([
				{
					$type: ADDRESS,
					locality: 'Bristol',
					country: 'UK',
					name: 'The Chapel, Cote Lane, Bristol BS9 2UN'
				}
			])
		).toBe('The Chapel, Cote Lane, Bristol BS9 2UN, UK');
	});

	// The code itself is never removed from what is shown: a calendar app wants it.
	it('keeps the postal code in the rendered label', () => {
		expect(
			locationFullLabel([
				{
					$type: ADDRESS,
					locality: 'London',
					country: 'UK',
					name: 'Soma, 231 Church St, London N16 9HP'
				}
			])
		).toContain('N16 9HP');
	});
});
