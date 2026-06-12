import { describe, it, expect, vi } from 'vitest';
import { createMeiliSink, meiliSinkBackendFromEnv, type MeiliSinkBackend } from './meili-sink';
import { searchDocId } from './normalize';

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
				SEARCH_SINK_INDEX: 'events-test'
			})
		).toEqual({ url: 'http://x', apiKey: 'k', indexUid: 'events-test' });
	});
});

describe('createMeiliSink onRecords', () => {
	it('upserts a created event as a normalized doc (PUT documents)', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(() => BACKEND, fn);

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
		const sink = createMeiliSink(() => BACKEND, fn);
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

	it('ignores records from other collections', async () => {
		const { fn, calls } = fakeFetch();
		const sink = createMeiliSink(() => BACKEND, fn);

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
		const sink = createMeiliSink(() => null, fn);

		await sink.onRecords([created('at://did:plc:alice/community.lexicon.calendar.event/3', {})], {
			phase: 'backfill'
		});

		expect(calls).toHaveLength(0);
	});
});
