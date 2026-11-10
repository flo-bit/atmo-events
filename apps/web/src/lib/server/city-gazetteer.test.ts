import { describe, expect, it } from 'vitest';
import { cityPoint } from './city-gazetteer';

describe('city gazetteer', () => {
	it('finds a city by name and country', () => {
		expect(cityPoint({ city: 'Berlin', country: 'DE', region: 'Berlin' })).toMatchObject({
			latitude: expect.closeTo(52.5, 0),
			longitude: expect.closeTo(13.4, 0)
		});
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
