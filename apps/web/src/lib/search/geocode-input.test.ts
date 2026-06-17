import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { geocodeInput } from './geocode-input';

describe('geocodeInput', () => {
	it('accepts a place query and trims it', () => {
		expect(v.parse(geocodeInput, { q: '  Louisville, KY ' })).toEqual({ q: 'Louisville, KY' });
	});

	it('rejects queries that are empty after trimming', () => {
		expect(() => v.parse(geocodeInput, { q: '   ' })).toThrow();
	});

	it('rejects oversized queries so arbitrary payloads are not forwarded upstream', () => {
		expect(() => v.parse(geocodeInput, { q: 'x'.repeat(201) })).toThrow();
	});
});
