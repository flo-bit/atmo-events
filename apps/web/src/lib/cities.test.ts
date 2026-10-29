import { describe, expect, it } from 'vitest';
import { cityContext, cityScope, citySearchParams, normalizeCityField } from './cities';

describe('city scope', () => {
	it('normalizes Unicode case and whitespace without guessing city-name aliases', () => {
		expect(cityScope({ city: ' Berlin ', country: ' DE ', region: '' })).toEqual({
			city: 'berlin',
			country: 'de',
			region: ''
		});
		expect(normalizeCityField('München')).toBe('münchen');
		expect(normalizeCityField('MÜNCHEN')).toBe('münchen');
		expect(normalizeCityField('\tＳａｎ　Francisco\n')).toBe('san francisco');
		expect(normalizeCityField('Munich')).toBe('munich');
	});
	it('rejects empty, mistyped and overlong fields', () => {
		expect(cityScope({ city: '   ', country: '', region: '' })).toBeNull();
		expect(cityScope({ city: 'Berlin', country: 5, region: '' } as never)).toBeNull();
		expect(cityScope({ city: 'x'.repeat(257), country: '', region: '' })).toBeNull();
	});
	it('carries missing qualifiers and safely encodes non-ASCII and URL punctuation', () => {
		const scope = { city: 'São Paulo', country: 'BR', region: 'A&B / C?' };
		expect(new URLSearchParams(citySearchParams(scope)).get('region')).toBe(scope.region);
		expect(citySearchParams({ city: 'Berlin', country: '', region: '' })).toBe('country=&region=');
	});
	it('displays country codes readably without requiring them', () => {
		expect(cityContext({ country: 'DE', region: 'Berlin' })).toBe('Berlin, Germany');
		expect(cityContext({ country: 'United Kingdom', region: 'England' })).toBe(
			'England, United Kingdom'
		);
		expect(cityContext({ country: '', region: '' })).toBe('');
	});
});
