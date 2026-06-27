import { describe, it, expect, vi } from 'vitest';
import {
	createMeiliSink,
	meiliSinkBackendFromEnv,
	applyMeiliSettings,
	MeiliEventIndex,
	type MeiliSinkBackend
} from './meili-sink';
import { searchDocId } from './normalize';
import { normalizeAddress, ADDRESS_TYPE } from './address-norm';

const BACKEND: MeiliSinkBackend = { url: 'http://meili.local', apiKey: 'admin-key' };

/** A fetch double that records calls and always returns 202 (Meili's task-
 *  accepted status). */
function fakeFetch() {
	const calls: { url: string; method: string; body: unknown }[] = [];
	const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? 'GET',
			body: init?.body ? JSON.parse(String(init.body)) : undefined
		});
		return new Response(null, { status: 202 });
	});
	return { fn: fn as unknown as typeof fetch, calls };
}

const EVENT = 'community.lexicon.calendar.event';

function created(uri: string, record: Record<string, unknown>) {
	return {
		kind: 'created' as const,
		uri,
		did: 'did:plc:alice',
		collection: EVENT,
		rkey: uri.split('/').pop()!,
		cid: 'bafycid',
		record,
		time_us: 1
	};
}

describe('meiliSinkBackendFromEnv', () => {
	it('returns null when the url is unset', () => {
		expect(meiliSinkBackendFromEnv({})).toBeNull();
		expect(meiliSinkBackendFromEnv(undefined)).toBeNull();
	});

	it('returns null (not throw) when the url is set but the key is missing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(meiliSinkBackendFromEnv({ SEARCH_SINK_URL: 'http://x' })).toBeNull();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('resolves a backend with an index override', () => {
		expect(
			meiliSinkBackendFromEnv({
				SEARCH_SINK_URL: 'http://x',
				SEARCH_SINK_API_KEY: 'k',
				SEARCH_INDEX: 'events-test'
			})
		).toEqual({ url: 'http://x', apiKey: 'k', indexUid: 'events-test' });
	});
});

describe('createMeiliSink onRecords', () => {
	it('upserts a created event as a normalized doc (PUT documents)', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			fn
		);

		await sink.onRecords(
			[
				created('at://did:plc:alice/community.lexicon.calendar.event/1', {
					name: 'Coffee',
					description: 'hang',
					startsAt: '2026-07-01T10:00:00Z',
					locations: [
						{
							$type: 'community.lexicon.location.geo',
							latitude: '40.0',
							longitude: '-105.0'
						}
					]
				})
			],
			{ phase: 'live' }
		);

		const put = calls.find((c) => c.method === 'PUT');
		expect(put).toBeDefined();
		expect(put!.url).toBe('http://meili.local/indexes/events/documents?primaryKey=id');
		const docs = put!.body as Array<Record<string, unknown>>;
		expect(docs).toHaveLength(1);
		expect(docs[0]).toMatchObject({
			id: searchDocId('at://did:plc:alice/community.lexicon.calendar.event/1'),
			uri: 'at://did:plc:alice/community.lexicon.calendar.event/1',
			name: 'Coffee',
			startsAt: '2026-07-01T10:00:00Z',
			_geo: { lat: 40, lng: -105 }
		});
	});

	it('removes a deleted event by derived id (delete-batch)', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			fn
		);
		const uri = 'at://did:plc:alice/community.lexicon.calendar.event/2';

		await sink.onRecords(
			[{ kind: 'deleted', uri, did: 'did:plc:alice', collection: EVENT, rkey: '2' }],
			{ phase: 'live' }
		);

		const del = calls.find((c) => c.url.endsWith('/documents/delete-batch'));
		expect(del).toBeDefined();
		expect(del!.method).toBe('POST');
		expect(del!.body).toEqual([searchDocId(uri)]);
	});

	it('removes (does not index) a created event hidden from discovery', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			fn
		);
		const uri = 'at://did:plc:alice/community.lexicon.calendar.event/hidden';

		await sink.onRecords(
			[created(uri, { name: 'Secret', preferences: { showInDiscovery: false } })],
			{ phase: 'live' }
		);

		// A hidden event's name/description must never reach the index; treat it as
		// a delete so a discoverable->unlisted flip purges any existing entry.
		expect(calls.find((c) => c.method === 'PUT')).toBeUndefined();
		const del = calls.find((c) => c.url.endsWith('/documents/delete-batch'));
		expect(del!.body).toEqual([searchDocId(uri)]);
	});

	it('removes a created event whose showInDiscovery is a numeric 0 (matches the SQL != 0 filter)', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			fn
		);
		const uri = 'at://did:plc:alice/community.lexicon.calendar.event/zero';

		await sink.onRecords(
			[created(uri, { name: 'SerializedFalse', preferences: { showInDiscovery: 0 } })],
			{ phase: 'live' }
		);

		// Some serializers emit booleans as 0/1; the D1 worklist/read filter uses
		// `!= 0`, so the sink must hide 0 too or it would index an event D1 drops.
		expect(calls.find((c) => c.method === 'PUT')).toBeUndefined();
		const del = calls.find((c) => c.url.endsWith('/documents/delete-batch'));
		expect(del!.body).toEqual([searchDocId(uri)]);
	});

	it('indexes a created event when showInDiscovery is missing or true', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			fn
		);

		await sink.onRecords(
			[
				created('at://did:plc:alice/community.lexicon.calendar.event/m', { name: 'NoPref' }),
				created('at://did:plc:alice/community.lexicon.calendar.event/t', {
					name: 'Shown',
					preferences: { showInDiscovery: true }
				})
			],
			{ phase: 'live' }
		);

		const put = calls.find((c) => c.method === 'PUT');
		expect((put!.body as unknown[]).length).toBe(2);
		expect(calls.find((c) => c.url.endsWith('/documents/delete-batch'))).toBeUndefined();
	});

	it('ignores records from other collections', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			fn
		);

		await sink.onRecords(
			[
				{
					kind: 'created',
					uri: 'at://did:plc:alice/community.lexicon.calendar.rsvp/9',
					did: 'did:plc:alice',
					collection: 'community.lexicon.calendar.rsvp',
					rkey: '9',
					cid: 'c',
					record: { status: 'going' },
					time_us: 1
				}
			],
			{ phase: 'live' }
		);

		expect(calls).toHaveLength(0);
	});

	it('no-ops (no fetch) when the backend is unconfigured', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => null,
			() => null,
			fn
		);

		await sink.onRecords([created('at://did:plc:alice/community.lexicon.calendar.event/3', {})], {
			phase: 'backfill'
		});

		expect(calls).toHaveLength(0);
	});

	it('applies index settings once, before the first write (fresh-index safety)', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(() => BACKEND, () => null, fn);

		// Two batches on the same sink: a fresh-rollout `pnpm backfill` must not
		// let PUT /documents auto-create a bare index whose _geo/startsAt searches
		// 400. Settings are applied exactly once, and before the first write.
		await sink.onRecords(
			[created('at://did:plc:alice/community.lexicon.calendar.event/a', { name: 'A' })],
			{ phase: 'backfill' }
		);
		await sink.onRecords(
			[created('at://did:plc:alice/community.lexicon.calendar.event/b', { name: 'B' })],
			{ phase: 'backfill' }
		);

		const settings = calls.filter((c) => c.method === 'PATCH' && c.url.endsWith('/settings'));
		expect(settings).toHaveLength(1);
		const firstSettingsIdx = calls.findIndex((c) => c.url.endsWith('/settings'));
		const firstPutIdx = calls.findIndex((c) => c.method === 'PUT');
		expect(firstSettingsIdx).toBeGreaterThanOrEqual(0);
		expect(firstSettingsIdx).toBeLessThan(firstPutIdx);
	});
});

describe('fetch is invoked detached (workerd Illegal invocation guard)', () => {
	// workerd throws "Illegal invocation" if the global fetch runs with `this`
	// bound to a non-global object — which `this.fetch(...)` method-call syntax
	// does. Node/undici is lenient, so the fakeFetch above never catches it;
	// this stub mirrors the runtime by rejecting any bound, non-global `this`.
	function strictFetch() {
		return function (this: unknown) {
			if (this !== undefined && this !== globalThis) {
				throw new TypeError('Illegal invocation');
			}
			return Promise.resolve(new Response(null, { status: 202 }));
		} as unknown as typeof fetch;
	}

	it('applyMeiliSettings does not trip Illegal invocation', async () => {
		await expect(applyMeiliSettings(BACKEND, strictFetch())).resolves.toBeUndefined();
	});

	it('onRecords upsert/delete do not trip Illegal invocation', async () => {
		const sink = createMeiliSink(
			() => BACKEND,
			() => null,
			strictFetch()
		);
		await expect(
			sink.onRecords(
				[created('at://did:plc:alice/community.lexicon.calendar.event/4', { name: 'x' })],
				{ phase: 'live' }
			)
		).resolves.toBeUndefined();
	});
});

/** A minimal D1 double: prepare().bind().all() returns the seeded resolved
 *  rows whose address_norm is in the bound args. Throw mode exercises the
 *  best-effort swallow. */
function fakeDb(
	rows: { address_norm: string; lat: number; lng: number }[],
	mode: 'ok' | 'throw' = 'ok'
) {
	return {
		prepare() {
			return {
				bind(...args: unknown[]) {
					return {
						async all<T>() {
							if (mode === 'throw') throw new Error('no such table: geocode_cache');
							return {
								results: rows.filter((r) => args.includes(r.address_norm)) as unknown as T[]
							};
						}
					};
				}
			};
		}
	} as unknown as D1Database;
}

const ADDR_RECORD = {
	name: 'TGIF meetup',
	locations: [{ $type: ADDRESS_TYPE, name: 'TGIF meetup', locality: 'Bruxelles', country: 'BE' }]
};

describe('createMeiliSink geocode cache lookup', () => {
	it('fills _geo from a resolved cache row for an address-only event', async () => {
		const norm = normalizeAddress({ name: 'TGIF meetup', locality: 'Bruxelles', country: 'BE' })!;
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => fakeDb([{ address_norm: norm, lat: 50.84, lng: 4.36 }]),
			fn
		);

		await sink.onRecords(
			[created('at://did:plc:alice/community.lexicon.calendar.event/addr', ADDR_RECORD)],
			{ phase: 'live' }
		);

		const put = calls.find((c) => c.method === 'PUT');
		const docs = put!.body as Array<Record<string, unknown>>;
		expect(docs[0]._geo).toEqual({ lat: 50.84, lng: 4.36 });
	});

	it('leaves _geo unset on a cache miss but still indexes the doc', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => fakeDb([]),
			fn
		);
		await sink.onRecords(
			[created('at://did:plc:alice/community.lexicon.calendar.event/miss', ADDR_RECORD)],
			{ phase: 'live' }
		);
		const docs = calls.find((c) => c.method === 'PUT')!.body as Array<Record<string, unknown>>;
		expect(docs[0]._geo).toBeUndefined();
		expect(docs[0].name).toBe('TGIF meetup');
	});

	it('does not consult the cache when the event already has coordinate _geo', async () => {
		const norm = normalizeAddress({ locality: 'Bruxelles', country: 'BE' })!;
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => fakeDb([{ address_norm: norm, lat: 1, lng: 1 }]),
			fn
		);
		await sink.onRecords(
			[
				created('at://did:plc:alice/community.lexicon.calendar.event/geo', {
					locations: [
						{ $type: 'community.lexicon.location.geo', latitude: '40.0', longitude: '-105.0' },
						{ $type: ADDRESS_TYPE, locality: 'Bruxelles', country: 'BE' }
					]
				})
			],
			{ phase: 'live' }
		);
		const docs = calls.find((c) => c.method === 'PUT')!.body as Array<Record<string, unknown>>;
		expect(docs[0]._geo).toEqual({ lat: 40, lng: -105 }); // from .geo, not the cache row
	});

	it('swallows a cache query error and indexes without _geo', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(
			() => BACKEND,
			() => fakeDb([], 'throw'),
			fn
		);
		await expect(
			sink.onRecords(
				[created('at://did:plc:alice/community.lexicon.calendar.event/err', ADDR_RECORD)],
				{ phase: 'live' }
			)
		).resolves.toBeUndefined();
		const docs = calls.find((c) => c.method === 'PUT')!.body as Array<Record<string, unknown>>;
		expect(docs[0]._geo).toBeUndefined();
		warn.mockRestore();
	});
});

describe('MeiliEventIndex.upsert', () => {
	it('PUTs a full doc with _geo (the write the geocode job makes to attach coords)', async () => {
		const { fn, calls } = fakeFetch();
		const doc = {
			id: 'abc',
			uri: 'at://did:plc:alice/community.lexicon.calendar.event/addr',
			did: 'did:plc:alice',
			rkey: 'addr',
			name: 'Antwerp Drinks',
			startsAt: '2099-01-01T10:00:00Z',
			locationTypes: ['community.lexicon.location.address'],
			_geo: { lat: 51.2194, lng: 4.4025 }
		};
		await new MeiliEventIndex(BACKEND, fn).upsert([doc]);

		// PUT /documents is "add or update" — it merges an existing doc and lands a
		// COMPLETE doc when absent, so a full-doc payload never leaves a {id,_geo} stub.
		const put = calls.find(
			(c) =>
				c.url === 'http://meili.local/indexes/events/documents?primaryKey=id' && c.method === 'PUT'
		);
		expect(put).toBeDefined();
		expect(put!.body).toEqual([doc]);
	});

	it('no-ops on an empty doc list', async () => {
		const { fn, calls } = fakeFetch();
		await new MeiliEventIndex(BACKEND, fn).upsert([]);
		expect(calls).toHaveLength(0);
	});
});
