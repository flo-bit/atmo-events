import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';
import { env } from 'cloudflare:workers';
import { FOR_YOU_AUDIENCE, FOR_YOU_METHOD, FOR_YOU_SCOPE } from '../atproto/recommendations';

const mocks = vi.hoisted(() => ({ permissions: vi.fn(), get: vi.fn(), dev: false }));
vi.mock('$app/env', () => ({
	get dev() {
		return mocks.dev;
	}
}));
vi.mock('#lib/atproto/server/oauth.js', () => ({
	getAuth: () => ({ api: { getPermissions: mocks.permissions } })
}));
vi.mock('#lib/contrail/index.js', () => ({
	ensureInit: vi.fn(),
	getServerClient: () => ({ get: mocks.get })
}));
import {
	eventUris,
	getRecommendedEvents,
	hydrateRecommendations,
	readRecommendationUris
} from './recommendations';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const other = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const uri = (key: string) => `at://${did}/community.lexicon.calendar.event/${key}`;
const NOW = Date.parse('2026-11-01T12:00:00Z');
const DAY = 86400000;
const databases: DatabaseSync[] = [];

function setup() {
	const sqlite = new DatabaseSync(':memory:');
	databases.push(sqlite);
	sqlite.exec(`CREATE TABLE records_event (uri TEXT PRIMARY KEY, record TEXT, did TEXT, cid TEXT);
		CREATE TABLE moderation_hidden (subject TEXT, cid TEXT, starts_at INTEGER, exp INTEGER)`);
	const bindCounts: number[] = [];
	function prepare(sql: string, params: SQLInputValue[] = []): D1PreparedStatement {
		return {
			bind: (...values: SQLInputValue[]) => {
				// SQLite permits more than D1: explicitly enforce D1's production cap.
				if (values.length > 100) throw new Error('D1: too many bound parameters');
				bindCounts.push(values.length);
				return prepare(sql, values);
			},
			run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
			all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
			first: async () => sqlite.prepare(sql).get(...params) ?? null
		} as unknown as D1PreparedStatement;
	}
	const db = {
		prepare,
		withSession: vi.fn(() => ({ prepare }))
	} as unknown as D1Database;
	const auth = vi.fn(async () => ({ ok: true, data: { token: 'service-jwt' } }));
	const client = { get: auth } as unknown as Client;
	const fetcher = vi.fn(async () => Response.json({ feed: [{ record: uri('a') }] }));
	return { db, sqlite, auth, client, fetcher, bindCounts };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	mocks.dev = false;
	mocks.permissions.mockResolvedValue({ grantedScope: ['atproto', FOR_YOU_SCOPE] });
	mocks.get.mockImplementation(async (_method, { params: { uri: recordUri } }) => ({
		ok: true,
		data: {
			uri: recordUri,
			did,
			rkey: recordUri.split('/').at(-1),
			value: {
				name: 'Recommended event',
				startsAt: '2099-01-01T12:00:00Z'
			}
		}
	}));
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	for (const sqlite of databases.splice(0)) sqlite.close();
});

describe('For You private daily cache', () => {
	it('uses the exact service JWT audience/method, filters events, and caches per DID for 24h', async () => {
		const { db, client, auth, fetcher, sqlite } = setup();
		expect(await readRecommendationUris(db, did, client, fetcher)).toEqual([uri('a')]);
		expect(auth).toHaveBeenCalledWith('com.atproto.server.getServiceAuth', {
			params: { aud: FOR_YOU_AUDIENCE, lxm: FOR_YOU_METHOD, exp: NOW / 1000 + 60 },
			signal: expect.any(AbortSignal)
		});
		const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.origin).toBe('https://foryou.club');
		expect(url.pathname).toBe(`/xrpc/${FOR_YOU_METHOD}`);
		expect(url.searchParams.get('nsid')).toBe('community.lexicon.calendar.event');
		expect(url.searchParams.get('limit')).toBe('100');
		expect(options).toMatchObject({
			headers: { Authorization: 'Bearer service-jwt' },
			redirect: 'error'
		});
		expect(db.withSession).toHaveBeenCalledWith('first-primary');
		vi.mocked(Date.now).mockReturnValue(NOW + DAY - 1);
		expect(await readRecommendationUris(db, did, client, fetcher)).toEqual([uri('a')]);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(auth).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(sqlite.prepare('SELECT * FROM for_you_cache').all())).not.toContain(
			'service-jwt'
		);
		vi.mocked(Date.now).mockReturnValue(NOW + DAY);
		await readRecommendationUris(db, did, client, fetcher);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('caches empty success responses for a day too', async () => {
		const { db, client, fetcher } = setup();
		fetcher.mockResolvedValue(Response.json({ feed: [] }));
		expect(await readRecommendationUris(db, did, client, fetcher)).toEqual([]);
		await readRecommendationUris(db, did, client, fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('deduplicates concurrent refreshes for one viewer', async () => {
		const { db, client, fetcher } = setup();
		await Promise.all(
			Array.from({ length: 10 }, () => readRecommendationUris(db, did, client, fetcher))
		);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('allows different viewers to refresh concurrently without a global gate', async () => {
		const { db, client, fetcher, sqlite } = setup();
		let finish!: (response: Response) => void;
		fetcher.mockReturnValueOnce(
			new Promise((resolve) => {
				finish = resolve;
			})
		);
		const first = readRecommendationUris(db, did, client, fetcher);
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		// A second viewer completes even while the first viewer's request is pending.
		expect(await readRecommendationUris(db, other, client, fetcher)).toEqual([uri('a')]);
		expect(fetcher).toHaveBeenCalledTimes(2);
		finish(Response.json({ feed: [] }));
		expect(await first).toEqual([]);
		expect(
			sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'for_you_gate'").get()
		).toBeUndefined();
	});
	it('preserves old ranks on errors and backs off for an hour', async () => {
		const { db, client, fetcher } = setup();
		await readRecommendationUris(db, did, client, fetcher);
		vi.mocked(Date.now).mockReturnValue(NOW + DAY);
		fetcher.mockRejectedValue(new Error('offline'));
		expect(await readRecommendationUris(db, did, client, fetcher)).toEqual([uri('a')]);
		await readRecommendationUris(db, did, client, fetcher);
		expect(fetcher).toHaveBeenCalledTimes(2);
		vi.mocked(Date.now).mockReturnValue(NOW + DAY + 3600000);
		await readRecommendationUris(db, did, client, fetcher);
		expect(fetcher).toHaveBeenCalledTimes(3);
	});
	it('does not call the recommender when service authentication fails', async () => {
		const { db, client, auth, fetcher } = setup();
		auth.mockResolvedValue({ ok: false } as never);
		await readRecommendationUris(db, did, client, fetcher);
		await readRecommendationUris(db, did, client, fetcher);
		expect(fetcher).not.toHaveBeenCalled();
		expect(auth).toHaveBeenCalledTimes(1);
	});
	it('does not cache malformed responses as successful empties', async () => {
		const { db, client, fetcher, sqlite } = setup();
		fetcher.mockResolvedValue(Response.json({ feed: 'oops' }));
		await readRecommendationUris(db, did, client, fetcher);
		expect(sqlite.prepare('SELECT refresh_after FROM for_you_cache').get()).toEqual({
			refresh_after: NOW + 3600000
		});
	});
	it('validates collection, DID-based URI syntax and deduplicates without reordering', () => {
		expect(
			eventUris([
				{ record: uri('b') },
				{ record: uri('a') },
				{ record: uri('b') },
				{ record: `at://${did}/app.bsky.feed.post/a` },
				{ record: 'https://example.test/' },
				{ record: 'at://alice.test/community.lexicon.calendar.event/a' },
				{ record: uri('..') },
				null,
				{ record: 3 }
			])
		).toEqual([uri('b'), uri('a')]);
	});
});

describe('recommendation visibility', () => {
	it('hydrates a full 100-URI feed within the D1 100-parameter limit', async () => {
		const { db, sqlite, bindCounts } = setup();
		const ranked = Array.from({ length: 100 }, (_, i) => uri(`event-${99 - i}`));
		for (const recordUri of ranked) {
			sqlite
				.prepare('INSERT INTO records_event VALUES (?, ?, ?, ?)')
				.run(recordUri, JSON.stringify({ startsAt: '2099-01-01T12:00:00Z' }), did, 'cid');
		}
		expect((await hydrateRecommendations(db, ranked)).map((event) => event.uri)).toEqual(
			ranked.slice(0, 6)
		);
		expect(bindCounts).toEqual([3]);
		expect(() => db.prepare('SELECT 1').bind(...Array(101).fill('value'))).toThrow(
			'D1: too many bound parameters'
		);
	});
	it('keeps rank order, filters current visibility/dates before limiting, and skips missing records', async () => {
		const { db, sqlite } = setup();
		const add = (key: string, fields: object = {}) =>
			sqlite
				.prepare('INSERT INTO records_event VALUES (?, ?, ?, ?)')
				.run(uri(key), JSON.stringify({ startsAt: '2099-01-01T12:00:00Z', ...fields }), did, 'cid');
		add('past', { startsAt: '2020-01-01T00:00:00Z' });
		add('hidden');
		sqlite
			.prepare('INSERT INTO moderation_hidden (subject, cid) VALUES (?, ?)')
			.run(uri('hidden'), '');
		add('private', { preferences: { showInDiscovery: false } });
		add('ongoing', { startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' });
		for (let i = 0; i < 8; i++) add(String(i));
		const ranked = [
			'past',
			'hidden',
			'private',
			'missing',
			'ongoing',
			'7',
			'5',
			'3',
			'1',
			'0',
			'2',
			'4'
		].map(uri);
		expect((await hydrateRecommendations(db, ranked)).map((e) => e.uri)).toEqual(
			['ongoing', '7', '5', '3', '1', '0'].map(uri)
		);
		expect(mocks.get).toHaveBeenCalledTimes(6);
		// Cached ranks must not bypass a new account-level hide.
		sqlite.prepare('INSERT INTO moderation_hidden (subject, cid) VALUES (?, ?)').run(did, '');
		expect(await hydrateRecommendations(db, ranked)).toEqual([]);
	});
	it('allows explicit local opt-in using local storage and the usual service-auth path', async () => {
		const privateStore = setup();
		const index = setup();
		index.sqlite
			.prepare('INSERT INTO records_event VALUES (?, ?, ?, ?)')
			.run(uri('a'), JSON.stringify({ startsAt: '2099-01-01T12:00:00Z' }), did, 'cid');
		Object.assign(env, {
			FOR_YOU_ENABLED: 'true',
			RECOMMENDATIONS_DB: privateStore.db,
			DB: index.db,
			REPORTS_DB: {
				prepare: vi.fn(() => {
					throw new Error('Reports DB must not be accessed');
				})
			}
		});
		mocks.dev = true;
		vi.stubGlobal('fetch', privateStore.fetcher);
		const locals: App.Locals = { did, client: privateStore.client, session: null };
		expect((await getRecommendedEvents(locals)).map((event) => event.uri)).toEqual([uri('a')]);
		expect(privateStore.fetcher).toHaveBeenCalledTimes(1);
		expect(privateStore.auth).toHaveBeenCalledTimes(1);
		await getRecommendedEvents(locals);
		expect(privateStore.fetcher).toHaveBeenCalledTimes(1);
		// A fresh cache must not bypass a reduced/revoked recommendation grant.
		mocks.permissions.mockResolvedValueOnce({ grantedScope: ['atproto'] });
		expect(await getRecommendedEvents(locals)).toEqual([]);
		expect(privateStore.fetcher).toHaveBeenCalledTimes(1);
		expect(mocks.permissions).toHaveBeenCalledTimes(3);
		expect(env.REPORTS_DB.prepare).not.toHaveBeenCalled();
	});
	it('never falls back to the reports DB when the dedicated binding is missing', async () => {
		const { db, client, auth } = setup();
		Object.assign(env, { REPORTS_DB: db });
		expect(await getRecommendedEvents({ did, client, session: null })).toEqual([]);
		expect(auth).not.toHaveBeenCalled();
		expect(db.withSession).not.toHaveBeenCalled();
	});
	it.each(['DB', 'REPORTS_DB'])('rejects a dedicated binding aliased to %s', async (binding) => {
		const { db, client, auth } = setup();
		Object.assign(env, { RECOMMENDATIONS_DB: db, [binding]: db });
		expect(await getRecommendedEvents({ did, client, session: null })).toEqual([]);
		expect(auth).not.toHaveBeenCalled();
		expect(db.withSession).not.toHaveBeenCalled();
	});
	it('allows explicitly disabling recommendations in production', async () => {
		Object.assign(env, { FOR_YOU_ENABLED: 'false' });
		const { client, auth } = setup();
		expect(await getRecommendedEvents({ did, client, session: null })).toEqual([]);
		expect(mocks.permissions).not.toHaveBeenCalled();
		expect(auth).not.toHaveBeenCalled();
	});
	it('omits signed-out, ungranted, development and missing-storage states without external requests', async () => {
		const locals = { did, client: { get: vi.fn() } } as unknown as App.Locals;
		expect(await getRecommendedEvents({} as App.Locals)).toEqual([]);
		mocks.permissions.mockResolvedValueOnce({ grantedScope: ['atproto'] });
		expect(await getRecommendedEvents(locals)).toEqual([]);
		expect(mocks.permissions).toHaveBeenCalledWith();
		mocks.dev = true;
		expect(await getRecommendedEvents(locals)).toEqual([]);
		mocks.dev = false;
		expect(await getRecommendedEvents(locals)).toEqual([]);
		expect(env.RECOMMENDATIONS_DB).toBeUndefined();
		expect(locals.client!.get).not.toHaveBeenCalled();
	});
});
