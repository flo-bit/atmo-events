import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/server/cities.js', () => ({ readNearbyPage: vi.fn() }));
import { readNearbyPage } from '#lib/server/cities.js';
import { GET } from './+server';

const request = (query = '') =>
	GET({
		url: new URL(`https://atmo.test/api/cities?${new URLSearchParams({ q: query })}`)
	} as never);
beforeEach(() => vi.resetAllMocks());

describe('city suggestions', () => {
	it('returns up to thirty city cards without reading or saving a visitor location', async () => {
		const cities = Array.from({ length: 40 }, (_, i) => ({
			city: `City ${i}`,
			country: 'DE',
			region: ''
		}));
		vi.mocked(readNearbyPage).mockResolvedValue({
			cities,
			detected: null,
			matched: null,
			nearby: []
		});
		const response = await request('mün');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ cities: cities.slice(0, 30) });
		expect(readNearbyPage).toHaveBeenCalledExactlyOnceWith(expect.anything(), undefined, 'mün');
		expect(response.headers.get('set-cookie')).toBeNull();
	});
	it('rejects oversized queries before accessing the catalog', async () => {
		expect((await request('x'.repeat(257))).status).toBe(400);
		expect(readNearbyPage).not.toHaveBeenCalled();
	});
	it('does not cache a failed lookup', async () => {
		vi.mocked(readNearbyPage).mockRejectedValue(new Error('offline'));
		const response = await request('ber');
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
