import { describe, it, expect, vi } from 'vitest';
import type { Client } from '@atcute/client';

// $lib/contrail's only runtime import from the UI package is getProfileUrl;
// mocking it keeps plyr's CSS (which Node's ESM loader rejects) out of the
// test graph. Same pattern as resolver.test.ts.
vi.mock('@atmo-dev/events-ui', () => ({ getProfileUrl: vi.fn() }));

import { runEventSearchPage, runNearMePage, searchBackendFromEnv } from './query';

// Meili side: fake fetch returning canned hits. D1 side: fake in-process
// contrail client returning canned hydrated records. The flow under test is
// the composition: rank-ordered hydration + consumed-offset cursor.
function meiliFetch(hits: Record<string, unknown>[], estimatedTotalHits: number) {
	const bodies: Record<string, unknown>[] = [];
	const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
		bodies.push(JSON.parse(String(init?.body)));
		return new Response(JSON.stringify({ hits, estimatedTotalHits }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}) as unknown as typeof fetch;
	return { fetchFn, bodies };
}

const record = (uri: string, name: string) => ({
	uri,
	did: uri.split('/')[2],
	rkey: uri.split('/').pop()!,
	cid: 'bafy',
	value: { name, startsAt: '2026-07-01T18:00:00Z' }
});

function fakeClient(records: unknown[], profiles: unknown[] = []) {
	return {
		get: vi.fn(async () => ({ ok: true, data: { records, profiles } }))
	} as unknown as Client;
}

const backend = (fetchFn: typeof fetch) => ({
	url: 'https://search.example',
	apiKey: 'k',
	fetch: fetchFn
});

describe('searchBackendFromEnv', () => {
	it('requires both url and key', () => {
		expect(searchBackendFromEnv({ SEARCH_URL: 'https://s' })).toBeNull();
		expect(searchBackendFromEnv({ SEARCH_URL: 'https://s', SEARCH_API_KEY: 'k' })).toEqual({
			url: 'https://s',
			apiKey: 'k'
		});
	});
});

describe('runEventSearchPage', () => {
	it('hydrates hits in rank order, drops unhydratable ones, advances cursor by consumed hits', async () => {
		const { fetchFn, bodies } = meiliFetch(
			[
				{ uri: 'at://did:plc:a/c/1' },
				{ uri: 'at://did:plc:gone/c/x' }, // not in D1 (e.g. foreign-network doc)
				{ uri: 'at://did:plc:b/c/2' }
			],
			50
		);
		const client = fakeClient(
			[record('at://did:plc:b/c/2', 'beta'), record('at://did:plc:a/c/1', 'alpha')],
			[{ did: 'did:plc:a', handle: 'alice.test' }]
		);

		const page = await runEventSearchPage(backend(fetchFn), client, { q: 'fest', cursor: '10' });

		expect(bodies[0].offset).toBe(10);
		expect(bodies[0].q).toBe('fest');
		expect(page.events.map((e) => e.name)).toEqual(['alpha', 'beta']);
		expect(page.handles).toEqual({ 'did:plc:a': 'alice.test' });
		// 3 hits examined, page not full: next offset = 10 + 3.
		expect(page.cursor).toBe('13');
	});

	it('ends pagination when the estimate is exhausted', async () => {
		const { fetchFn } = meiliFetch([{ uri: 'at://did:plc:a/c/1' }], 1);
		const client = fakeClient([record('at://did:plc:a/c/1', 'alpha')]);

		const page = await runEventSearchPage(backend(fetchFn), client, { q: 'x', cursor: null });

		expect(page.events).toHaveLength(1);
		expect(page.cursor).toBeNull();
	});
});

describe('runNearMePage', () => {
	it('returns distances keyed by uri alongside hydrated events', async () => {
		const { fetchFn, bodies } = meiliFetch(
			[{ uri: 'at://did:plc:a/c/1', _geoDistance: 420 }],
			1
		);
		const client = fakeClient([record('at://did:plc:a/c/1', 'alpha')]);

		const page = await runNearMePage(backend(fetchFn), client, {
			lat: 38.25,
			lng: -85.76,
			radiusMeters: 25000,
			cursor: null
		});

		expect(bodies[0].filter).toBe('_geoRadius(38.25, -85.76, 25000)');
		expect(page.events.map((e) => e.name)).toEqual(['alpha']);
		expect(page.distances).toEqual({ 'at://did:plc:a/c/1': 420 });
		expect(page.cursor).toBeNull();
	});
});
