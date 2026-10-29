import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@atcute/client';
import { Contrail, createIngestEvent, ingestRecords } from '@atmo-dev/contrail';
import { createSqliteDatabase } from '@atmo-dev/contrail/sqlite';
import { config } from '../contrail.config';
import { literalSearch } from './search';
import { happeningNowQuery, searchD1Query, topicQuery } from './queries';
import { ongoingQuery } from './ongoing';
import { decodeCursor } from './cursor';
vi.mock('./index', () => ({ getServerClient: vi.fn() }));
import { getServerClient } from './index';
import { runLoadMoreEvents } from './events-load-more';

let client: Client;
const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
	const db = createSqliteDatabase(':memory:');
	const contrail = new Contrail({ ...config, profiles: [] });
	await contrail.init(db);
	await ingestRecords(
		db,
		Array.from({ length: 50 }, (_, i) =>
			createIngestEvent({
				did,
				collection: 'community.lexicon.calendar.event',
				rkey: `event-${i}`,
				cid: 'cid',
				operation: 'create',
				timeUs: i + 1,
				value: {
					$type: 'community.lexicon.calendar.event',
					name: 'Jazz #music web-development C++ music: live "quoted" OR party',
					startsAt: i < 25 ? '2099-01-01T00:00:00Z' : '2026-10-01T00:00:00Z',
					endsAt: '2099-01-02T00:00:00Z',
					createdAt: '2026-01-01T00:00:00Z'
				}
			})
		),
		contrail.config
	);
	const handle = contrail.handler({ db });
	client = new Client({
		handler: (path, init) => handle(new Request(new URL(path, 'http://localhost'), init))
	});
	vi.mocked(getServerClient).mockReturnValue(client);
});
afterEach(() => vi.useRealTimers());

describe('literal user searches against a populated FTS5 index', () => {
	it('quotes operators and escapes embedded quotes while retaining all-term matching', () => {
		expect(literalSearch('  jazz OR "live"  ')).toBe('"jazz" AND "OR" AND """live"""');
		expect(literalSearch(' \t ')).toBe('');
	});
	it.each(['#music', 'web-development', 'C++', 'music: live', '"quoted"', 'jazz OR party'])(
		'uses the same safe expression on upcoming, live, preview and load-more queries: %s',
		async (term) => {
			const page = await searchD1Query(client, { term }, null);
			expect(page.events).toHaveLength(20);
			expect(page.cursor).toBeTruthy();
			const next = await runLoadMoreEvents({} as Cloudflare.Env, { cursor: page.cursor!, q: term });
			expect(next.events).toHaveLength(5);
			expect(new Set([...page.events, ...next.events].map((e) => e.uri)).size).toBe(25);
			const live = await happeningNowQuery(client, null, { search: term });
			expect(live.events).toHaveLength(20);
			const moreLive = await runLoadMoreEvents({} as Cloudflare.Env, {
				cursor: live.cursor!,
				q: term
			});
			expect(moreLive.events).toHaveLength(5);
			expect((await ongoingQuery(client, { term })).total).toBe(25);
		}
	);
	it.each(['"', '+++', 'missing OR party'])(
		'returns no matches rather than an error or operator evaluation: %s',
		async (term) => {
			expect((await searchD1Query(client, { term }, null)).events).toEqual([]);
			expect((await happeningNowQuery(client, null, { search: term })).events).toEqual([]);
			expect((await ongoingQuery(client, { term })).events).toEqual([]);
		}
	);
	it('keeps topic OR expressions intact, including live continuations', async () => {
		const page = await topicQuery(client, { slug: 'music' }, null);
		expect(page.events).toHaveLength(20);
		expect(decodeCursor(page.cursor)?.args).toEqual({ slug: 'music' });
		const live = await happeningNowQuery(client, null, { slug: 'music' });
		expect(live.events).toHaveLength(20);
		expect(
			(await runLoadMoreEvents({} as Cloudflare.Env, { cursor: live.cursor! })).events
		).toHaveLength(5);
	});
});
