import { describe, expect, it } from 'vitest';
import { countryCode, normalizeCityAddress } from './city-normalization';

const address = (city: string, country = 'US', region = '') =>
	normalizeCityAddress({ city, country, region });

describe('lightweight supplied-city normalization', () => {
	it.each([
		['US', 'US'],
		['usa', 'US'],
		['United States', 'US'],
		['United States of America', 'US'],
		['India', 'IN'],
		['Deutschland', 'DE'],
		['Germany', 'DE'],
		['Nederland', 'NL'],
		['Norge', 'NO'],
		['Österreich', 'AT'],
		['España', 'ES'],
		['UK', 'GB'],
		['臺灣', 'TW'],
		['België / Belgique / Belgien', 'BE']
	])('normalizes country %s to %s', (name, code) => expect(countryCode(name)).toBe(code));

	it.each([
		['Boulder', 'CO'],
		['Boulder', 'Colorado'],
		['Boulder, Colorado, 80302', 'CO'],
		['Boulder, Colorado, 80304', 'Colorado'],
		['Boulder, CO, 80302', ''],
		['Boulder, Colorado, 80302, United States', ''],
		['Boulder, CO', '']
	])('normalizes %s / %s to the same city', (city, region) => {
		expect(address(city, 'US', region)).toEqual({
			scope: { city: 'boulder', country: 'us', region: 'co' },
			label: { city: 'Boulder', country: 'US', region: 'Colorado' }
		});
	});

	it('also handles Canadian postal suffixes, country variants, and Dutch region variants', () => {
		expect(address('Montréal, QC, H2X 1Y4', 'Canada')).toEqual(address('Montréal', 'CA', 'Québec'));
		expect(address('Amsterdam', 'Nederland', 'Noord-Holland')).toEqual(
			address('Amsterdam', 'NL', 'North Holland')
		);
		expect(address('MÜNCHEN', 'Deutschland')?.scope).toEqual(address('München', 'DE')?.scope);
	});

	it('does not treat US state abbreviations as other countries', () => {
		expect(address('San Francisco, CA')?.scope).toEqual({
			city: 'san francisco',
			country: 'us',
			region: 'ca'
		});
		expect(address('Indianapolis, IN')?.scope.country).toBe('us');
	});

	it('preserves real regional distinctions and does not invent city-name aliases', () => {
		expect(address('Springfield', 'US', 'IL')?.scope).not.toEqual(
			address('Springfield', 'US', 'MA')?.scope
		);
		expect(address('Munich', 'DE')?.scope).not.toEqual(address('München', 'DE')?.scope);
		expect(address('Berlin', '', '')?.scope.country).toBe('');
	});

	it.each([
		['Boulder, Colorado, 80302', 'US', 'Massachusetts'],
		['Boulder, Colorado, Canada', 'US', 'CO'],
		['Some City, Unknown Region', 'US', ''],
		['12345', 'US', ''],
		['https://example.com', 'US', ''],
		['Test', '', ''],
		['TBD', '', '']
	])(
		'does not turn contradictory or malformed metadata into a city: %s',
		(city, country, region) => {
			expect(address(city, country, region)).toBeNull();
		}
	);
});
