import { afterEach, describe, expect, it, vi } from 'vitest';

// The one route that picks between two backends whose cursors are NOT
// interchangeable: Meilisearch (offset) and the D1 LIKE fallback (opaque keyset).
// Only page 1 may fall back — a continuation must not switch backends — so these
// pin which backend serves the page, that the emitted envelope names it, and that
// no inbound ?cursor= is ever resumed here (the term rides ?q=, not the
// envelope).
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(),
	runEventSearchPage: vi.fn(),
	runOngoingSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import {
	runEventSearchPage,
	runOngoingSearchPage,
	searchBackendFromEnv
} from '$lib/search/server/query';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';

const mockSearchBackendFromEnv = vi.mocked(searchBackendFromEnv);
const mockRunEventSearchPage = vi.mocked(runEventSearchPage);
const mockRunOngoingSearchPage = vi.mocked(runOngoingSearchPage);
const mockListDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	cursor: string | null;
	query: string;
};

const runLoad = async (q: string, cursor?: string) => (await load(event(q, cursor))) as LoadResult;

// Two DIFFERENT queries now reach listDiscoverable on this route, so tests must
// pick the one they mean rather than trusting call order:
//   - the D1 SEARCH page  — bounded `startsAtMin` (upcoming only)
//   - the ONGOING band    — bounded `startsAtMax` + `endsAtMin` (happening now)
// The band runs on BOTH backends (the Meili path has no such gap, but its results
// dedupe by uri), which is exactly why "was D1 used?" can no longer be asked as
// "was listDiscoverable called at all?".
const paramsOf = (i: number) => mockListDiscoverable.mock.calls[i][1] as Record<string, unknown>;
const d1SearchCall = () =>
	mockListDiscoverable.mock.calls
		.map((_, i) => paramsOf(i))
		.find((p) => p.startsAtMin !== undefined);
const bandCall = () =>
	mockListDiscoverable.mock.calls.map((_, i) => paramsOf(i)).find((p) => p.endsAtMin !== undefined);

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
		// No term means no band either — "happening now" here is scoped to what was
		// searched for, so with nothing searched there is nothing to scope to.
		expect(result).toEqual({
			events: [],
			handles: {},
			cursor: null,
			ongoing: [],
			ongoingTotal: 0,
			ongoingTotalIsFloor: false,
			query: ''
		});
		expect(mockSearchBackendFromEnv).not.toHaveBeenCalled();
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});

	it('serves the Meili page wrapped in a search-meili envelope when the backend succeeds', async () => {
		const backend = { url: 'https://meili.test', apiKey: 'k' };
		mockSearchBackendFromEnv.mockReturnValue(backend);
		mockRunEventSearchPage.mockResolvedValue({
			events: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			handles: { 'did:plc:a': 'alice' },
			cursor: 'meili:20',
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>);
		mockRunOngoingSearchPage.mockResolvedValue({
			events: [],
			handles: {},
			cursor: null,
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runOngoingSearchPage>>);

		const result = await runLoad('kite');

		// The offset rides inside a self-describing envelope, so load-more re-runs
		// the Meili path (not D1 listRecords) with the term from ?q=/input.
		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'search-meili', raw: 'meili:20' });
		// The D1 SEARCH pipeline stays untouched when Meili serves the page...
		expect(d1SearchCall()).toBeUndefined();
		// ...and so does D1 entirely: the BAND runs on the SAME backend as the list
		// it introduces. Meili ranks by relevance, which gives no guarantee a live
		// event lands on page 1, so the section is what makes "on right now"
		// reachable without paging — but it has to be looking at the same corpus,
		// or it shows events its own "see all" cannot reach.
		expect(mockRunOngoingSearchPage).toHaveBeenCalledWith(backend, expect.anything(), {
			q: 'kite'
		});
		expect(bandCall()).toBeUndefined();
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
		const params = d1SearchCall()!;
		expect(params).toMatchObject({ search: 'kite', order: 'desc' });
		expect(typeof params.startsAtMin).toBe('string');
		// ...and it keeps its upcoming-only bound: the band, not a widened search
		// query, is what covers events already under way.
		expect(params.endsAtMin).toBeUndefined();
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

		// Assert against the SEARCH call specifically — the band never carries a
		// cursor at all, so indexing calls[0] could pass without proving anything.
		expect(d1SearchCall()!.cursor).toBeUndefined();
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

		// Assert against the SEARCH call specifically — the band never carries a
		// cursor at all, so indexing calls[0] could pass without proving anything.
		expect(d1SearchCall()!.cursor).toBeUndefined();
	});
});

describe('the ongoing band runs the same backend as the list beside it', () => {
	// EventList promotes any live event out of the LIST into the band, so a band
	// on a different backend from its list shows events its own query never
	// returned — and the "See all" destination, running the band's query, then
	// cannot contain them. Measured on testnet: a band of 2 linking to a page of 1,
	// the missing one a year-long event Meili ranked for the term and D1 did not.
	const backend = { url: 'https://meili.test', apiKey: 'k' };

	const meiliBand = {
		events: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/live' }],
		handles: { 'did:plc:a': 'alice' },
		cursor: null,
		distances: {}
	} as unknown as Awaited<ReturnType<typeof runOngoingSearchPage>>;

	it('uses the search backend for the band when one is configured', async () => {
		mockSearchBackendFromEnv.mockReturnValue(backend);
		mockRunEventSearchPage.mockResolvedValue({
			events: [],
			handles: {},
			cursor: null,
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>);
		mockRunOngoingSearchPage.mockResolvedValue(meiliBand);

		const result = (await runLoad('town')) as LoadResult & { ongoing: { uri: string }[] };

		expect(mockRunOngoingSearchPage).toHaveBeenCalledWith(backend, expect.anything(), {
			q: 'town'
		});
		// No D1 band call: the band and the list are on one backend now.
		expect(bandCall()).toBeUndefined();
		expect(result.ongoing.map((e) => e.uri)).toEqual([
			'at://did:plc:a/community.lexicon.calendar.event/live'
		]);
	});

	it('falls back to the D1 band when the search backend fails', async () => {
		mockSearchBackendFromEnv.mockReturnValue(backend);
		mockRunEventSearchPage.mockResolvedValue({
			events: [],
			handles: {},
			cursor: null,
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>);
		mockRunOngoingSearchPage.mockRejectedValue(new Error('meili down'));
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		await runLoad('town');

		// A degraded band beats no band: the D1 window is narrower, not wrong.
		expect(bandCall()).toMatchObject({ search: 'town' });
	});

	it('uses the D1 band when no search backend is configured', async () => {
		mockSearchBackendFromEnv.mockReturnValue(null);
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		await runLoad('town');

		expect(mockRunOngoingSearchPage).not.toHaveBeenCalled();
		expect(bandCall()).toMatchObject({ search: 'town' });
	});
});
