import { afterEach, describe, expect, it, vi } from 'vitest';

// The search load decides between two backends whose cursors are NOT
// interchangeable: Meilisearch (offset cursor) and the D1 LIKE fallback (opaque
// keyset). Both now hand back a self-describing continuation ENVELOPE: the Meili
// path a 'search-meili' envelope, the D1 fallback a 'search-d1' envelope. The D1
// fallback used to return cursor:null because load-more had no safe way to
// re-run the discoverable+startsAtMin query — the envelope closes that gap (and
// with it the earlier "search results stop after the first batch" limitation),
// so these tests now pin a REAL cursor on the D1 path, keyed to a query the
// load-more registry re-runs identically.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';

const mockSearchBackendFromEnv = vi.mocked(searchBackendFromEnv);
const mockRunEventSearchPage = vi.mocked(runEventSearchPage);
const mockListDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	cursor: string | null;
	query: string;
};

const runLoad = async (q: string, cursor?: string) => (await load(event(q, cursor))) as LoadResult;

function event(q: string, cursor?: string) {
	const url = new URL('https://atmo.test/search');
	if (q) url.searchParams.set('q', q);
	if (cursor) url.searchParams.set('cursor', cursor);
	// platform.env is opaque here; the query module is mocked, so its contents
	// only matter to the (mocked) searchBackendFromEnv.
	return { url, platform: { env: {} } } as unknown as Parameters<typeof load>[0];
}

afterEach(() => vi.clearAllMocks());

describe('search page load', () => {
	it('returns early for an empty query without touching any backend', async () => {
		const result = await load(event(''));
		expect(result).toEqual({ events: [], handles: {}, cursor: null, query: '' });
		expect(mockSearchBackendFromEnv).not.toHaveBeenCalled();
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});

	it('serves the Meili page wrapped in a search-meili envelope when the backend succeeds', async () => {
		mockSearchBackendFromEnv.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockRunEventSearchPage.mockResolvedValue({
			events: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			handles: { 'did:plc:a': 'alice' },
			cursor: 'meili:20',
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>);

		const result = await runLoad('kite');

		// The offset rides inside a self-describing envelope, so load-more re-runs
		// the Meili path (not D1 listRecords) with the term from ?q=/input.
		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'search-meili', raw: 'meili:20' });
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});

	it('paginates the D1 fallback with a search-d1 envelope when a configured backend fails', async () => {
		mockSearchBackendFromEnv.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockRunEventSearchPage.mockRejectedValue(new Error('meili down'));
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:b/community.lexicon.calendar.event/2' }],
			profiles: [{ did: 'did:plc:b', handle: 'bob' }],
			cursor: 'd1-opaque-cursor'
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await runLoad('kite');

		expect(result.handles).toEqual({ 'did:plc:b': 'bob' });
		// The D1 cursor is now RESUMABLE: a search-d1 envelope whose load-more re-runs
		// the same discoverable + startsAtMin + desc query. No more cursor:null.
		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'search-d1', raw: 'd1-opaque-cursor' });
	});

	it('paginates the D1 fallback with a search-d1 envelope when no backend is configured', async () => {
		mockSearchBackendFromEnv.mockReturnValue(null);
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:c/community.lexicon.calendar.event/3' }],
			profiles: [],
			cursor: 'd1-opaque-cursor'
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await runLoad('kite');

		// First batch is the discoverable, upcoming-only, desc D1 query...
		const params = mockListDiscoverable.mock.calls[0][1];
		expect(params).toMatchObject({ search: 'kite', order: 'desc' });
		expect(typeof params.startsAtMin).toBe('string');
		// ...and later pages resume it via a real envelope, not cursor:null.
		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'search-d1', raw: 'd1-opaque-cursor' });
		expect(mockRunEventSearchPage).not.toHaveBeenCalled();
	});

	it('ends cleanly (cursor:null) only on a genuinely last D1 page', async () => {
		mockSearchBackendFromEnv.mockReturnValue(null);
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:d/community.lexicon.calendar.event/4' }],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await runLoad('kite');
		expect(result.cursor).toBeNull();
	});

	it('deep-link: does NOT resume even its OWN search-d1 envelope (term not in envelope)', async () => {
		mockSearchBackendFromEnv.mockReturnValue(null);
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		// The keyset was minted for SOME term, but the term rides ?q= and is absent
		// from the envelope — a `dogs` keyset under ?q=kite would corrupt pagination,
		// and the two are indistinguishable. So page 1 always starts fresh.
		const inbound = encodeCursor({ v: 1, q: 'search-d1', raw: 'page2keyset' });
		await runLoad('kite', inbound);

		expect(mockListDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});

	it('deep-link: ignores a foreign-query envelope (fresh page 1, no resume)', async () => {
		mockSearchBackendFromEnv.mockReturnValue(null);
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		// An 'events' envelope deep-linked into /search must not resume its keyset.
		const foreign = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'nope' });
		await runLoad('kite', foreign);

		expect(mockListDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});
});
