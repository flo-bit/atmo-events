import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({ ensureInit: vi.fn() }));
vi.mock('#lib/server/cities.js', () => ({
	readCitySuggestions: vi.fn(),
	refreshCitySnapshot: vi.fn()
}));

import { load } from './+page.server';
import { ensureInit } from '#lib/contrail/index.js';
import { readCitySuggestions } from '#lib/server/cities.js';

const cities = [{ city: 'Berlin', country: 'DE', region: '', count: 42 }];
const run = async (cf?: object, setHeaders = vi.fn()) =>
	(await load({ request: { cf }, setHeaders } as never)) as {
		cities: typeof cities | null;
		nearby: typeof cities;
		inCountry: typeof cities;
	};
afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('cities overview', () => {
	it('reads one shared catalog and falls back to worldwide cities without location', async () => {
		vi.mocked(readCitySuggestions).mockResolvedValue({ cities, nearby: [], inCountry: [] });
		expect((await run()).cities).toEqual(cities);
		expect(ensureInit).toHaveBeenCalledOnce();
		expect(readCitySuggestions).toHaveBeenCalledExactlyOnceWith(expect.anything(), undefined);
	});
	it('uses Cloudflare location and prevents shared caching', async () => {
		vi.mocked(readCitySuggestions).mockResolvedValue({ cities, nearby: cities, inCountry: [] });
		const setHeaders = vi.fn();
		const cf = { latitude: '52.5', longitude: '13.4', country: 'DE' };
		expect((await run(cf, setHeaders)).nearby).toEqual(cities);
		expect(readCitySuggestions).toHaveBeenCalledExactlyOnceWith(expect.anything(), cf);
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});
	it('distinguishes an unavailable database from no upcoming cities', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readCitySuggestions)
			.mockResolvedValueOnce({ cities: [], nearby: [], inCountry: [] })
			.mockRejectedValueOnce(new Error('D1 unavailable'));
		expect((await run()).cities).toEqual([]);
		expect((await run()).cities).toBeNull();
	});
});
