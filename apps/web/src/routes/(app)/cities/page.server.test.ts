import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('#lib/contrail/index.js', () => ({
	ensureInit: vi.fn(),
	getServerClient: vi.fn(() => ({}))
}));
vi.mock('#lib/contrail/queries.js', () => ({
	cityQuery: vi.fn(),
	EMPTY_PAGE: { events: [], handles: {}, cursor: null }
}));
vi.mock('#lib/server/cities.js', () => ({
	readNearbyPage: vi.fn(),
	refreshCitySnapshot: vi.fn(),
	NEARBY_RADIUS_KM: 200
}));

import { load } from './+page.server';
import { readNearbyPage } from '#lib/server/cities.js';
import { cityQuery } from '#lib/contrail/queries.js';

const berlin = { city: 'Berlin', country: 'DE', region: '', count: 2 };
const potsdam = { city: 'Potsdam', country: 'DE', region: 'Brandenburg', count: 1 };
const brandenburg = { city: 'Brandenburg', country: 'DE', region: 'Brandenburg', count: 1 };
const cf = { city: 'Berlin', country: 'DE', latitude: '52.5', longitude: '13.4' };
const empty = { events: [], handles: {}, cursor: null };
const run = (query = '', location: unknown = cf, setHeaders = vi.fn()) =>
	load({
		request: { cf: location },
		url: new URL(`https://atmo.test/cities${query}`),
		setHeaders
	} as never);
beforeEach(() => {
	vi.mocked(readNearbyPage).mockResolvedValue({
		detected: berlin,
		matched: berlin,
		nearby: [{ city: potsdam, distanceKm: 28.4 }],
		cities: [berlin]
	});
	vi.mocked(cityQuery).mockResolvedValue({ events: [{}] as never, handles: {}, cursor: null });
});
afterEach(() => vi.clearAllMocks());

describe('events nearby', () => {
	it('shows events in the detected city and prevents shared caching', async () => {
		const headers = vi.fn();
		expect(await run('', cf, headers)).toMatchObject({
			mode: 'events',
			detected: berlin,
			shown: berlin,
			noLocalEvents: false,
			locationSource: 'ip',
			distanceKm: null,
			radiusKm: 200
		});
		expect(readNearbyPage).toHaveBeenCalledWith(expect.anything(), cf, '', { explicit: false });
		expect(cityQuery).toHaveBeenCalledOnce();
		expect(headers).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});
	it('shows the nearest candidate with live results, skipping stale cities', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: berlin,
			cities: [berlin],
			nearby: [
				{ city: potsdam, distanceKm: 28.4 },
				{ city: brandenburg, distanceKm: 57.8 }
			]
		});
		vi.mocked(cityQuery).mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
		expect(await run()).toMatchObject({
			mode: 'events',
			shown: brandenburg,
			noLocalEvents: true,
			distanceKm: 58
		});
		expect(cityQuery).toHaveBeenCalledTimes(3);
	});
	it('shows the closest live city when no city matches', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: null,
			cities: [],
			nearby: [{ city: potsdam, distanceKm: 28 }]
		});
		expect(await run()).toMatchObject({ shown: potsdam, noLocalEvents: true, distanceKm: 28 });
	});
	it('returns an honest empty state when all nearby candidates are stale', async () => {
		vi.mocked(cityQuery).mockResolvedValue(empty);
		expect(await run()).toMatchObject({ shown: null, noLocalEvents: true, ...empty });
		expect(cityQuery).toHaveBeenCalledTimes(2);
	});
	it('keeps a sparse local page with a continuation instead of claiming no events', async () => {
		vi.mocked(cityQuery).mockResolvedValue({ ...empty, cursor: 'more' });
		expect(await run()).toMatchObject({ shown: berlin, noLocalEvents: false, cursor: 'more' });
		expect(cityQuery).toHaveBeenCalledOnce();
	});
	it('does not show a distant city when no nearby candidates exist', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: berlin,
			matched: null,
			nearby: [],
			cities: []
		});
		expect(await run()).toMatchObject({ shown: null, noLocalEvents: true, ...empty });
		expect(cityQuery).not.toHaveBeenCalled();
	});
	it('uses an explicit city from the URL', async () => {
		await run('?city=Berlin&country=DE&region=Berlin');
		expect(readNearbyPage).toHaveBeenCalledWith(
			expect.anything(),
			{ city: 'Berlin', country: 'DE', region: 'Berlin' },
			'',
			{ explicit: true }
		);
	});
	it('allows an explicit countryless catalog choice', async () => {
		await run('?city=Legacy+City&country=&region=');
		expect(readNearbyPage).toHaveBeenCalledWith(
			expect.anything(),
			{ city: 'Legacy City', country: '', region: '' },
			'',
			{ explicit: true }
		);
	});
	it('uses IP location by default', async () => {
		expect(await run()).toMatchObject({ locationSource: 'ip', detected: berlin });
		expect(readNearbyPage).toHaveBeenCalledWith(expect.anything(), cf, '', { explicit: false });
	});
	it('offers a picker when location is unavailable or another city is requested', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: null,
			matched: null,
			nearby: [],
			cities: [berlin]
		});
		expect(await run('', null)).toMatchObject({ mode: 'choose', cities: [berlin] });
		expect(await run('?choose=1&q=ber')).toMatchObject({ mode: 'choose', search: 'ber' });
		expect(readNearbyPage).toHaveBeenLastCalledWith(expect.anything(), undefined, 'ber', {
			explicit: false
		});
		expect(cityQuery).not.toHaveBeenCalled();
	});
	it('does not save a rejected selection', async () => {
		vi.mocked(readNearbyPage).mockResolvedValue({
			detected: null,
			matched: null,
			nearby: [],
			cities: []
		});
		expect(await run('?city=unknown')).toMatchObject({ mode: 'choose' });
	});
	it('shows an error when the catalog is unavailable', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readNearbyPage).mockRejectedValue(new Error('unavailable'));
		expect(await run()).toMatchObject({ mode: 'unavailable' });
		vi.restoreAllMocks();
	});
});
