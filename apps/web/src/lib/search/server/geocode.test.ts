import { describe, expect, it, vi } from 'vitest';
import { geocodeLocation } from './geocode';
import { DEFAULT_GEOCODER_URL, DEFAULT_GEOCODER_USER_AGENT } from './geocoder';

function fakeFetch(status: number, body: unknown) {
	return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

const louisville = [
	{ lat: '38.2542',
		lon: '-85.7594',
		display_name: 'Louisville, Jefferson County, Kentucky, United States' }
];

describe('geocodeLocation', () => {
	it('queries Nominatim and returns the top result as numeric coords', async () => {
		const fetchImpl = fakeFetch(200, louisville);

		const result = await geocodeLocation('Louisville, KY', fetchImpl);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [input, init] = fetchImpl.mock.calls[0] as unknown as [URL | string, RequestInit];
		const url = new URL(String(input));
		// URL is sourced from the shared geocoder constant, not a local literal.
		const shared = new URL(DEFAULT_GEOCODER_URL);
		expect(url.hostname).toBe(shared.hostname);
		expect(url.pathname).toBe(shared.pathname);
		expect(url.hostname).toBe('nominatim.openstreetmap.org');
		expect(url.searchParams.get('q')).toBe('Louisville, KY');
		expect(url.searchParams.get('format')).toBe('jsonv2');
		expect(url.searchParams.get('limit')).toBe('1');
		// Nominatim's usage policy requires an identifying User-Agent; default
		// comes from the shared env-driven helper.
		expect(new Headers(init.headers).get('user-agent')).toBe(DEFAULT_GEOCODER_USER_AGENT);
		expect(DEFAULT_GEOCODER_USER_AGENT).toMatch(/atmo/i);

		expect(result).toEqual({
			lat: 38.2542,
			lng: -85.7594,
			label: 'Louisville, Jefferson County, Kentucky, United States'
		});
	});

	it('sources the User-Agent from GEOCODER_USER_AGENT when set', async () => {
		const fetchImpl = fakeFetch(200, louisville);

		await geocodeLocation('Louisville, KY', fetchImpl, {
			GEOCODER_USER_AGENT: 'custom-agent/9.9 (https://example.test)'
		});

		const [, init] = fetchImpl.mock.calls[0] as unknown as [URL | string, RequestInit];
		expect(new Headers(init.headers).get('user-agent')).toBe('custom-agent/9.9 (https://example.test)');
	});

	it('returns null when nothing matches', async () => {
		expect(await geocodeLocation('zzzz no such place', fakeFetch(200, []))).toBeNull();
	});

	it('returns null when the result has non-numeric coordinates', async () => {
		const garbage = [{ lat: 'not-a-number', lon: '-85.7594', display_name: 'x' }];
		expect(await geocodeLocation('somewhere', fakeFetch(200, garbage))).toBeNull();
	});

	it('throws on upstream failure without including the response body', async () => {
		const fetchImpl = fakeFetch(503, { secret: 'internal upstream detail' });
		await expect(geocodeLocation('Louisville', fetchImpl)).rejects.toThrow(
			'geocode request failed: 503'
		);
		await expect(geocodeLocation('Louisville', fetchImpl)).rejects.not.toThrow(/internal/);
	});
});
