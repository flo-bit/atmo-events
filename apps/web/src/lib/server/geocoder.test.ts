import { describe, expect, it, vi } from 'vitest';
import { createGeocoder, DEFAULT_GEOCODER_URL, DEFAULT_GEOCODER_USER_AGENT } from './geocoder';

describe('interactive event geocoder', () => {
	it('keeps structured address and map data', async () => {
		const fetcher = vi.fn(async () =>
			Response.json([
				{
					lat: '52.5',
					lon: '13.4',
					display_name: 'Berlin',
					address: { country_code: 'de' },
					osm_type: 'node',
					osm_id: 123
				}
			])
		);
		const result = await createGeocoder({}, fetcher).geocode('Berlin');
		expect(result).toMatchObject({
			lat: 52.5,
			lng: 13.4,
			label: 'Berlin',
			address: { country_code: 'de' },
			osmId: 123
		});
		const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.origin + url.pathname).toBe(DEFAULT_GEOCODER_URL);
		expect(url.searchParams.get('addressdetails')).toBe('1');
		expect(init.headers).toMatchObject({ 'user-agent': DEFAULT_GEOCODER_USER_AGENT });
	});
	it('sends provider keys only to configured non-public endpoints', async () => {
		const fetcher = vi.fn(async () => Response.json([]));
		await createGeocoder({ GEOCODER_KEY: 'secret' }, fetcher).geocode('test');
		expect(String((fetcher.mock.calls[0] as unknown[])[0])).not.toContain('secret');
		await createGeocoder(
			{ GEOCODER_URL: 'https://provider.example/search', GEOCODER_KEY: 'secret' },
			fetcher
		).geocode('test');
		expect(String((fetcher.mock.calls[1] as unknown[])[0])).toContain('key=secret');
	});
	it.each([
		{ body: [] },
		{ body: [{ lat: '100', lon: '10' }] },
		{ body: [{ lat: '10', lon: 'NaN' }] },
		{ body: [{}] }
	])('rejects missing/invalid matches $body', async ({ body }) => {
		expect(await createGeocoder({}, async () => Response.json(body)).geocode('x')).toBeNull();
	});
	it('distinguishes no-match from service failure', async () => {
		expect(
			await createGeocoder({}, async () => new Response(null, { status: 404 })).geocode('x')
		).toBeNull();
		await expect(
			createGeocoder({}, async () => new Response(null, { status: 503 })).geocode('x')
		).rejects.toThrow('503');
	});
});
