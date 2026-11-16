import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/contrail/index.js', () => ({
	getServerClient: vi.fn(() => ({})),
	ensureInit: vi.fn()
}));
vi.mock('#lib/server/cities.js', () => ({
	readCitySnapshot: vi.fn(),
	refreshCitySnapshot: vi.fn()
}));
vi.mock('#lib/contrail.js', () => ({
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listCityEventsFromContrail: vi.fn(),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));

import { cityQuery } from './queries';
import { listCityEventsFromContrail, listDiscoverableEventsFromContrail } from '#lib/contrail.js';
import { readCitySnapshot } from '#lib/server/cities.js';
import { cityScope } from '#lib/cities.js';
import { decodeCursor, encodeCursor } from '#lib/contrail/cursor.js';
import { runLoadMoreEvents } from '#lib/contrail/events-load-more.js';

const list = vi.mocked(listCityEventsFromContrail);
const read = vi.mocked(readCitySnapshot);
const scope = { city: 'berlin', country: 'de', region: '' };
const version = '11111111-1111-4111-8111-111111111111';
const raw = (offset: number) => `city-snapshot:${version}:${offset}`;
const members = Array.from({ length: 45 }, (_, i): [string, string] => [
	`at://event/${i}`,
	'2050-01-01T12:00:00.000Z'
]);
const env = { DB: {} } as Cloudflare.Env;
// First page for a city, as rendered by /cities.
const firstPage = (city = 'Berlin', country = 'DE', region = '') =>
	cityQuery({} as never, cityScope({ city, country, region })!, null, env.DB);
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
	read.mockResolvedValue({ version, events: members });
	list.mockImplementation(
		async (_client, { uris }) =>
			({
				records: [...uris].reverse().map((uri) => ({ uri })),
				profiles: [{ did: 'did:plc:a', handle: 'alice.test' }]
			}) as never
	);
});
afterEach(() => {
	vi.resetAllMocks();
	vi.useRealTimers();
});

describe('snapshot city query and live load-more', () => {
	it('hydrates only the page IDs, restores snapshot ordering and scopes the continuation', async () => {
		const result = await firstPage();
		expect(list.mock.calls[0][1]).toEqual({
			...scope,
			uris: members.slice(0, 20).map(([uri]) => uri),
			snapshot: version,
			profiles: true,
			limit: 20
		});
		expect(result.events).toEqual(members.slice(0, 20).map(([uri]) => ({ uri })));
		expect(result.handles).toEqual({ 'did:plc:a': 'alice.test' });
		expect(decodeCursor(result.cursor as string)).toEqual({
			v: 1,
			q: 'city',
			args: scope,
			raw: raw(20)
		});
		expect(listDiscoverableEventsFromContrail).not.toHaveBeenCalled();
	});

	it('walks every snapshot member exactly once through the shared load-more query', async () => {
		let result = await firstPage();
		const uris = result.events.map(({ uri }) => uri);
		while (result.cursor) {
			result = await runLoadMoreEvents(env, { cursor: result.cursor });
			uris.push(...result.events.map(({ uri }) => uri));
		}
		expect(uris).toEqual(members.map(([uri]) => uri));
		expect(list).toHaveBeenCalledTimes(3);
		expect(read.mock.calls[1][2]).toBe(version);
	});

	it.each([{}, { city: '' }, { city: 'berlin', country: 'de' }, { ...scope, city: ' ' }])(
		'fails closed for incomplete or empty scope %j',
		async (args) => {
			expect(
				await runLoadMoreEvents(env, {
					cursor: encodeCursor({ v: 1, q: 'city', args, raw: raw(20) })
				})
			).toEqual({ events: [], handles: {}, cursor: null });
			expect(list).not.toHaveBeenCalled();
		}
	);

	it('preserves empty qualifiers and Unicode scopes through continuation', async () => {
		for (const [city, country, region] of [
			['Aceh', '', ''],
			['Malmö', 'SE', 'Skåne län'],
			['東'.repeat(256), 'CN', '南'.repeat(256)]
		]) {
			const result = await firstPage(city, country, region);
			const expected = {
				city: city.toLowerCase(),
				country: country.toLowerCase(),
				region: region.toLowerCase()
			};
			expect(decodeCursor(result.cursor!)?.args).toEqual(expected);
			await runLoadMoreEvents(env, { cursor: result.cursor! });
			expect(list.mock.lastCall![1]).toMatchObject(expected);
			expect(list.mock.lastCall![1].uris[0]).toBe(members[20][0]);
		}
	});

	it('refills hidden/deleted/moved records but bounds each request to 60 candidates', async () => {
		read.mockResolvedValue({
			version,
			events: Array.from({ length: 100 }, (_, i) => [`at://event/${i}`, '2050-01-01T00:00:00.000Z'])
		});
		list.mockResolvedValue({ records: [] } as never);
		const result = await firstPage();
		expect(result.events).toEqual([]);
		expect(list).toHaveBeenCalledTimes(3);
		expect(decodeCursor(result.cursor!)?.raw).toBe(raw(60));
	});

	it('fills a partial page without consuming or dropping the next page’s live records', async () => {
		list.mockResolvedValueOnce({
			records: members.slice(0, 10).map(([uri]) => ({ uri }))
		} as never);
		const result = await firstPage();
		expect(result.events).toHaveLength(20);
		expect(list.mock.calls[1][1].uris).toEqual(members.slice(20, 30).map(([uri]) => uri));
		expect(decodeCursor(result.cursor!)?.raw).toBe(raw(30));
	});

	it('hydrates elapsed snapshot dates so rescheduled records can be checked live', async () => {
		read.mockResolvedValue({
			version,
			events: [['at://past', '2020-01-01T00:00:00.000Z'], ...members]
		});
		await firstPage();
		expect(list.mock.lastCall![1].uris).toContain('at://past');
		expect(list.mock.lastCall![1]).not.toHaveProperty('startsAtMin');
	});

	it.each([
		'legacy-keyset',
		'city-snapshot:bad:20',
		`city-snapshot:${version}:-1`,
		`city-snapshot:${version}:999999999`
	])('ends malformed or out-of-bounds cursors without restarting: %s', async (cursor) => {
		const result = await runLoadMoreEvents(env, {
			cursor: encodeCursor({ v: 1, q: 'city', args: scope, raw: cursor })
		});
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
		expect(list).not.toHaveBeenCalled();
	});

	it('ends an expired snapshot instead of switching to the latest version', async () => {
		read.mockResolvedValue(null);
		expect(
			await runLoadMoreEvents(env, {
				cursor: encodeCursor({ v: 1, q: 'city', args: scope, raw: raw(20) })
			})
		).toEqual({ events: [], handles: {}, cursor: null });
		expect(read.mock.lastCall![2]).toBe(version);
		expect(list).not.toHaveBeenCalled();
	});

	it('throws on hydration failure rather than silently skipping a page', async () => {
		list.mockResolvedValue(null);
		await expect(firstPage()).rejects.toThrow('hydration failed');
	});
});
