import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({
	ensureInit: vi.fn(),
	getServerClient: vi.fn(() => ({}))
}));
vi.mock('#lib/contrail/queries.js', () => ({
	cityQuery: vi.fn(),
	EMPTY_PAGE: { events: [], handles: {}, cursor: null }
}));
vi.mock('#lib/server/cities.js', () => ({ readNearbyPage: vi.fn(), refreshCitySnapshot: vi.fn() }));

import { load } from './+page.server';
import { readNearbyPage } from '#lib/server/cities.js';
import { cityQuery } from '#lib/contrail/queries.js';

const berlin = { city: 'Berlin', country: 'DE', region: '', count: 2 };
const leipzig = { city: 'Leipzig', country: 'DE', region: 'Saxony', count: 1 };
const cf = { city: 'Berlin', country: 'DE', latitude: '52.5', longitude: '13.4' };
const run = (query = '', location: unknown = cf, setHeaders = vi.fn()) =>
	load({
		request: { cf: location },
		url: new URL(`https://atmo.test/cities${query}`),
		setHeaders
	} as never);
afterEach(() => vi.clearAllMocks());

describe('events nearby', () => {
	it('shows events in the detected city and prevents shared caching', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: berlin,
			nearest: leipzig,
			cities: [berlin]
		});
		vi.mocked(cityQuery).mockResolvedValue({ events: [{}] as never, handles: {}, cursor: null });
		const headers = vi.fn();
		const result = await run('', cf, headers);
		expect(result).toMatchObject({
			mode: 'events',
			detected: berlin,
			shown: berlin,
			noLocalEvents: false
		});
		expect(readNearbyPage).toHaveBeenCalledWith(expect.anything(), cf, '');
		expect(cityQuery).toHaveBeenCalledOnce();
		expect(headers).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});
	it('shows the nearest city when the detected city has no events', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: null,
			nearest: leipzig,
			cities: [leipzig]
		});
		vi.mocked(cityQuery).mockResolvedValue({ events: [{}] as never, handles: {}, cursor: null });
		expect(await run()).toMatchObject({
			mode: 'events',
			detected: berlin,
			shown: leipzig,
			noLocalEvents: true
		});
	});
	it('falls back if the matched city has no live results', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: berlin,
			nearest: leipzig,
			cities: [berlin]
		});
		vi.mocked(cityQuery)
			.mockResolvedValueOnce({ events: [], handles: {}, cursor: null })
			.mockResolvedValueOnce({ events: [{}] as never, handles: {}, cursor: null });
		expect(await run()).toMatchObject({ mode: 'events', shown: leipzig, noLocalEvents: true });
	});
	it('uses a manually selected city rather than the IP location', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: berlin,
			nearest: null,
			cities: []
		});
		vi.mocked(cityQuery).mockResolvedValue({ events: [{}] as never, handles: {}, cursor: null });
		await run('?city=Berlin&country=DE&region=Berlin');
		expect(readNearbyPage).toHaveBeenCalledWith(
			expect.anything(),
			{ city: 'Berlin', country: 'DE', region: 'Berlin' },
			''
		);
	});
	it('offers a picker when location is unavailable or the user chooses another city', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: null,
			matched: null,
			nearest: null,
			cities: [berlin]
		});
		expect(await run('', null)).toMatchObject({ mode: 'choose', cities: [berlin] });
		expect(await run('?choose=1&q=ber')).toMatchObject({ mode: 'choose', search: 'ber' });
		expect(readNearbyPage).toHaveBeenLastCalledWith(expect.anything(), undefined, 'ber');
		expect(cityQuery).not.toHaveBeenCalled();
	});
	it('shows an error when the catalog is unavailable', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readNearbyPage).mockRejectedValue(new Error('unavailable'));
		expect(await run()).toMatchObject({ mode: 'unavailable' });
		vi.restoreAllMocks();
	});
});
