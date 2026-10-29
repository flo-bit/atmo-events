import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/contrail/index.js', () => ({ getServerClient: vi.fn(() => ({})) }));
vi.mock('#lib/contrail.js', () => ({
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listCityEventsFromContrail: vi.fn(),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
vi.mock('#lib/search/server/query.js', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { listCityEventsFromContrail, listDiscoverableEventsFromContrail } from '#lib/contrail.js';
import { decodeCursor, encodeCursor, type CursorArgs } from '#lib/contrail/cursor.js';
import { runLoadMoreEvents } from '#lib/contrail/events-load-more.js';

const list = vi.mocked(listCityEventsFromContrail);
const scope = { city: 'berlin', country: 'de', region: '' };
const env = { DB: {} } as Cloudflare.Env;
const page = () => ({ records: [], profiles: [], cursor: 'd1-next' });
function event(cursor?: string, country = 'DE', region = '', city = 'Berlin') {
	const url = new URL(`https://atmo.test/cities/${encodeURIComponent(city)}`);
	url.searchParams.set('country', country);
	url.searchParams.set('region', region);
	if (cursor) url.searchParams.set('cursor', cursor);
	return { params: { city }, url } as unknown as Parameters<typeof load>[0];
}
afterEach(() => vi.clearAllMocks());

describe('city page and load-more share one query', () => {
	it('lists upcoming events soonest first and scopes the cursor by all three fields', async () => {
		list.mockResolvedValue({
			...page(),
			profiles: [{ did: 'did:plc:a', handle: 'alice.test' }]
		} as never);
		const result = (await load(event())) as Record<string, unknown>;
		expect(list.mock.calls[0][1]).toMatchObject({
			...scope,
			sort: 'startsAt',
			order: 'asc',
			profiles: true,
			limit: 20
		});
		expect(list.mock.calls[0][1].startsAtMin).toEqual(expect.any(String));
		expect(result.pageTitle).toBe('Events in Berlin');
		expect(result.handles).toEqual({ 'did:plc:a': 'alice.test' });
		expect(decodeCursor(result.cursor as string)).toEqual({
			v: 1,
			q: 'city',
			args: scope,
			raw: 'd1-next'
		});
		expect(listDiscoverableEventsFromContrail).not.toHaveBeenCalled();
	});

	it('page 1 and load-more issue the same filters, with only the keyset changing', async () => {
		list.mockResolvedValue(page() as never);
		const result = (await load(event())) as { cursor: string };
		await runLoadMoreEvents(env, { cursor: result.cursor });
		const [first, second] = list.mock.calls.map((call) => call[1]);
		expect(second).toEqual({ ...first, startsAtMin: expect.any(String), cursor: 'd1-next' });
	});

	it('resumes only a deep link with the same city, country and region', async () => {
		list.mockResolvedValue(page() as never);
		const token = (args: CursorArgs) => encodeCursor({ v: 1, q: 'city', args, raw: 'resume' });
		await load(event(token(scope)));
		expect(list.mock.lastCall![1].cursor).toBe('resume');
		for (const other of [
			{ ...scope, city: 'paris' },
			{ ...scope, country: 'us' },
			{ ...scope, region: 'berlin' }
		]) {
			await load(event(token(other)));
			expect(list.mock.lastCall![1].cursor).toBeUndefined();
		}
		await load(event(encodeCursor({ v: 1, q: 'events', raw: 'foreign' })));
		expect(list.mock.lastCall![1].cursor).toBeUndefined();
	});

	it.each([{}, { city: '' }, { city: 'berlin', country: 'de' }, { ...scope, city: ' ' }])(
		'fails closed for incomplete or empty scope %j',
		async (args) => {
			const result = await runLoadMoreEvents(env, {
				cursor: encodeCursor({ v: 1, q: 'city', args, raw: 'resume' })
			});
			expect(result).toEqual({ events: [], handles: {}, cursor: null });
			expect(list).not.toHaveBeenCalled();
		}
	);

	it('accepts empty qualifiers, but never drops a supplied qualifier on continuation', async () => {
		list.mockResolvedValue(page() as never);
		const empty = { city: 'aceh', country: '', region: '' };
		await runLoadMoreEvents(env, {
			cursor: encodeCursor({ v: 1, q: 'city', args: empty, raw: 'next' })
		});
		expect(list.mock.lastCall![1]).toMatchObject({ ...empty, cursor: 'next' });
	});

	it('preserves non-ASCII city names through the cursor', async () => {
		list.mockResolvedValue(page() as never);
		const result = (await load(event(undefined, 'SE', 'Skåne län', 'Malmö'))) as { cursor: string };
		expect(decodeCursor(result.cursor)?.args).toEqual({
			city: 'malmö',
			country: 'se',
			region: 'skåne län'
		});
		await runLoadMoreEvents(env, { cursor: result.cursor });
		expect(list.mock.lastCall![1]).toMatchObject({
			city: 'malmö',
			country: 'se',
			region: 'skåne län'
		});
	});

	it('continues long Unicode scopes through load-more and deep links', async () => {
		const city = '東'.repeat(256);
		const region = '南'.repeat(256);
		const raw = Buffer.from(
			JSON.stringify({
				t: 1793000000000000,
				v: '2050-01-01T12:00:00.000Z',
				k: 'field:startsAt',
				u: 'at://did:plc:abcdefghijklmnopqrstuvwx/community.lexicon.calendar.event/3abcdefghi123'
			})
		).toString('base64url');
		list.mockResolvedValue({ ...page(), cursor: raw } as never);
		const result = (await load(event(undefined, 'CN', region, city))) as { cursor: string };
		expect(result.cursor.length).toBeGreaterThan(1500);
		expect(decodeCursor(result.cursor)?.args).toEqual({ city, country: 'cn', region });
		await runLoadMoreEvents(env, { cursor: result.cursor });
		expect(list).toHaveBeenCalledTimes(2);
		expect(list.mock.lastCall![1]).toMatchObject({ city, country: 'cn', region, cursor: raw });
		await load(event(result.cursor, 'CN', region, city));
		expect(list.mock.lastCall![1].cursor).toBe(raw);
	});

	it('ends only when the backend ends; no matching events can still carry a continuation', async () => {
		list.mockResolvedValue({ records: [], cursor: null } as never);
		const result = (await load(event())) as { cursor: string | null };
		expect(result.cursor).toBeNull();
	});

	it('rejects a blank city before accessing records', async () => {
		await expect(load(event(undefined, '', '', ' '))).rejects.toMatchObject({ status: 404 });
		expect(list).not.toHaveBeenCalled();
	});
});
