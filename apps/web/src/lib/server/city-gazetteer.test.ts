import { describe, expect, it } from 'vitest';
import { cityPoint, searchCityGazetteer } from './city-gazetteer';

describe('city gazetteer', () => {
	it('finds a city by name and country', () => {
		expect(cityPoint({ city: 'Berlin', country: 'DE', region: 'Berlin' })).toMatchObject({
			latitude: expect.closeTo(52.5, 0),
			longitude: expect.closeTo(13.4, 0)
		});
	});
	it('recognizes explicitly supported local names and administrative codes', () => {
		const munich = cityPoint({ city: 'Munich', country: 'DE', region: 'Bavaria' });
		expect(munich).toBeDefined();
		for (const name of ['München', 'Muenchen']) {
			expect(cityPoint({ city: name, country: 'DE', region: 'BY' })).toEqual(munich);
			expect(searchCityGazetteer(name)[0]).toMatchObject({ city: 'Munich', country: 'DE' });
		}
		expect(cityPoint({ city: 'Berlin', country: 'DE', region: 'BE' })).toEqual(
			cityPoint({ city: 'Berlin', country: 'DE', region: 'Berlin' })
		);
	});
	it('prioritizes exact search results before prefixes', () => {
		expect(searchCityGazetteer('boulder')[0]).toMatchObject({
			city: 'Boulder',
			region: 'Colorado'
		});
		expect(searchCityGazetteer('')).toEqual([]);
	});
	it('does not guess between cities or countries', () => {
		expect(cityPoint({ city: 'Springfield', country: 'US', region: '' })).toBeUndefined();
		expect(cityPoint({ city: 'Berlin', country: '', region: '' })).toBeUndefined();
		expect(cityPoint({ city: 'Berlin', country: 'US', region: 'Not a state' })).toBeUndefined();
	});
	it('uses the supplied region to distinguish cities with the same name', () => {
		const massachusetts = cityPoint({ city: 'Springfield', country: 'US', region: 'MA' });
		const illinois = cityPoint({ city: 'Springfield', country: 'US', region: 'IL' });
		expect(massachusetts?.longitude).toBeGreaterThan(-74);
		expect(illinois?.longitude).toBeLessThan(-88);
	});
});
