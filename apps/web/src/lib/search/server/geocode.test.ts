import { describe, expect, it, vi } from 'vitest';
import { geocodeLocation } from './geocode';

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
		expect(url.hostname).toBe('nominatim.openstreetmap.org');
		expect(url.pathname).toBe('/search');
		expect(url.searchParams.get('q')).toBe('Louisville, KY');
		expect(url.searchParams.get('format')).toBe('jsonv2');
		expect(url.searchParams.get('limit')).toBe('1');
		// Nominatim's usage policy requires an identifying User-Agent.
		expect(new Headers(init.headers).get('user-agent')).toMatch(/openmeet/i);

		expect(result).toEqual({
			lat: 38.2542,
			lng: -85.7594,
			label: 'Louisville, Jefferson County, Kentucky, United States'
		});
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
