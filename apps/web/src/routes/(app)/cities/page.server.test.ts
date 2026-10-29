import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({ ensureInit: vi.fn() }));
vi.mock('#lib/server/cities.js', () => ({ readTopCities: vi.fn(), refreshCitySnapshot: vi.fn() }));

import { load } from './+page.server';
import { ensureInit } from '#lib/contrail/index.js';
import { readTopCities } from '#lib/server/cities.js';

const cities = [{ city: 'Berlin', country: 'DE', region: '', count: 42 }];
const run = async () => (await load({} as never)) as { cities: typeof cities | null };
afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('cities overview', () => {
	it('uses the shared normalized catalog (which owns caching) without a second stale cache', async () => {
		vi.mocked(readTopCities).mockResolvedValue(cities);
		expect((await run()).cities).toEqual(cities);
		expect(ensureInit).toHaveBeenCalledOnce();
		expect(readTopCities).toHaveBeenCalledOnce();
	});
	it('distinguishes an unavailable database from no upcoming cities', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readTopCities)
			.mockResolvedValueOnce([])
			.mockRejectedValueOnce(new Error('D1 unavailable'));
		expect((await run()).cities).toEqual([]);
		expect((await run()).cities).toBeNull();
	});
});
