import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { nearMeInput } from './near-me-input';

describe('nearMeInput', () => {
	it('accepts in-range coordinates and radius', () => {
		const parsed = v.parse(nearMeInput, { lat: 38.25, lng: -85.76, radiusMeters: 25000 });
		expect(parsed).toEqual({ lat: 38.25, lng: -85.76, radiusMeters: 25000 });
	});

	it('rejects out-of-range latitude/longitude', () => {
		expect(() => v.parse(nearMeInput, { lat: 91, lng: 0, radiusMeters: 1000 })).toThrow();
		expect(() => v.parse(nearMeInput, { lat: 0, lng: -181, radiusMeters: 1000 })).toThrow();
	});

	it('rejects radii beyond the 500 km cap (abuse bound, UI offers fixed choices)', () => {
		expect(() => v.parse(nearMeInput, { lat: 0, lng: 0, radiusMeters: 1_000_000 })).toThrow();
	});
});
