import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
vi.mock('./index', () => ({ getServerClient: () => ({}) }));
vi.mock('#lib/contrail.js', () => ({
	listDiscoverableEventsFromContrail: vi.fn(async () => ({ records: [], cursor: 'next' })),
	listAuthoredEventsFromContrail: vi.fn(async () => ({ records: [], cursor: 'next' })),
	flattenEventRecords: (records: unknown[]) => records
}));
import {
	listDiscoverableEventsFromContrail,
	listAuthoredEventsFromContrail
} from '#lib/contrail.js';
import { decodeCursor, nextCursor } from './cursor';
import { listEventsInput, runLoadMoreEvents } from './events-load-more';
const discover = vi.mocked(listDiscoverableEventsFromContrail);
const authored = vi.mocked(listAuthoredEventsFromContrail);
const env = { DB: {} } as Cloudflare.Env;
afterEach(() => vi.clearAllMocks());

describe('load-more uses server-owned database queries', () => {
	it('resumes discovery with server-applied filters', async () => {
		const result = await runLoadMoreEvents(env, {
			cursor: nextCursor('events', 'key', { popular: true })!
		});
		expect(discover.mock.calls[0][1]).toMatchObject({
			startsAtMin: expect.any(String),
			rsvpsCountMin: 2,
			sort: 'startsAt',
			order: 'asc',
			cursor: 'key'
		});
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: true },
			raw: 'next'
		});
	});
	it('keeps both live bounds and an explicit soonest-ending sort', async () => {
		await runLoadMoreEvents(env, { cursor: nextCursor('happening-now', 'key')!, q: 'jazz' });
		expect(discover.mock.calls[0][1]).toMatchObject({
			startsAtMax: expect.any(String),
			endsAtMin: expect.any(String),
			search: '"jazz"',
			sort: 'endsAt',
			order: 'asc'
		});
	});
	it.each(['hosting', 'past-events'] as const)('scopes %s to the envelope actor', async (q) => {
		await runLoadMoreEvents(env, { cursor: nextCursor(q, 'key', { actor: 'example.test' })! });
		expect(authored.mock.calls[0][1]).toMatchObject({ actor: 'example.test', cursor: 'key' });
	});
	it('continues free-text search without changing the term or backend', async () => {
		const result = await runLoadMoreEvents(env, {
			cursor: nextCursor('search-d1', 'key')!,
			q: 'jazz'
		});
		expect(discover.mock.calls[0][1]).toMatchObject({ search: '"jazz"', cursor: 'key', limit: 20 });
		expect(decodeCursor(result.cursor)?.q).toBe('search-d1');
	});
	it.each([
		undefined,
		'',
		'meili:20',
		btoa(JSON.stringify({ v: 1, q: 'search-meili', raw: '20' }))
	])('ends removed or invalid continuations without a read: %s', async (cursor) => {
		expect((await runLoadMoreEvents(env, { cursor })).cursor).toBeNull();
		expect(discover).not.toHaveBeenCalled();
		expect(authored).not.toHaveBeenCalled();
	});
	it('ends search when the term is lost', async () => {
		expect(
			(await runLoadMoreEvents(env, { cursor: nextCursor('search-d1', 'key')! })).events
		).toEqual([]);
		expect(discover).not.toHaveBeenCalled();
	});
	it('does not trust a client-supplied pipeline/filter bag', () => {
		expect(
			v.parse(listEventsInput, {
				cursor: 'k',
				q: 'jazz',
				pipeline: 'plain',
				actor: 'evil',
				conditions: ['1=1']
			})
		).toEqual({ cursor: 'k', q: 'jazz' });
	});
});
