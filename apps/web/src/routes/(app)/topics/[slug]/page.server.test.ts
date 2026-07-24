import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Page 1 of /topics/[slug] comes from this route's load(); page 2 comes from the
// load-more registry's 'topic' resumer. Both derive the OR-search from the slug
// server-side, and both must issue the same discoverable query, so these drive
// both for real and compare what each one emitted — plus the deep-link guard.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
// events-load-more.ts imports the search module at load time; the topic query
// never hits it, so a null-backend stub keeps the import deterministic. $lib/topics
// is intentionally left REAL so orQueryFromSlug derives the same OR-search on both
// the page-1 and resumer sides.
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { runLoadMoreEvents } from '$lib/contrail/events-load-more';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';
import { FROZEN_NOW, expectSameQuery } from '$lib/contrail/continuity.test-utils';

const mockListDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

const env = { DB: {} } as unknown as App.Platform['env'];

type LoadResult = {
	topic: { slug: string };
	events: unknown[];
	handles: Record<string, string>;
	cursor: string | null;
	query: string;
};

function event(slug: string, cursor?: string) {
	const url = new URL(`https://atmo.test/topics/${slug}`);
	if (cursor) url.searchParams.set('cursor', cursor);
	return { params: { slug }, url, platform: { env: {} } } as unknown as Parameters<typeof load>[0];
}

const run = async (slug: string, cursor?: string) =>
	(await load(event(slug, cursor))) as unknown as LoadResult;

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW }));
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('topic page load', () => {
	it("builds a 'topic' envelope carrying the slug, deriving the OR-search server-side", async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			profiles: [{ did: 'did:plc:a', handle: 'alice' }],
			cursor: 'd1-topic-cursor'
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await run('technology');

		const params = mockListDiscoverable.mock.calls[0][1];
		// orQueryFromSlug('technology') — the SAME helper the load-more registry uses.
		expect(params.search).toBe('tech OR technology');
		expect(params).toMatchObject({ order: 'asc', limit: 20, profiles: true });
		expect(typeof params.startsAtMin).toBe('string');
		expect(result.query).toBe('tech OR technology');
		// A resumable envelope, not cursor:null.
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'topic',
			args: { slug: 'technology' },
			raw: 'd1-topic-cursor'
		});
	});

	it('ends cleanly (cursor:null) only on a genuinely last page', async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await run('technology');
		expect(result.cursor).toBeNull();
	});

	it('deep-link: resumes a topic envelope by feeding its raw keyset to D1', async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const inbound = encodeCursor({
			v: 1,
			q: 'topic',
			args: { slug: 'technology' },
			raw: 'p2keyset'
		});
		await run('technology', inbound);

		expect(mockListDiscoverable.mock.calls[0][1]).toMatchObject({ cursor: 'p2keyset' });
	});

	it('deep-link: ignores a foreign-query envelope (fresh page 1)', async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const foreign = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'nope' });
		await run('technology', foreign);

		expect(mockListDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});

	it('deep-link: ignores a topic envelope minted for a DIFFERENT slug (fresh page 1)', async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		// A 'technology' keyset deep-linked into /topics/ai names the same query but
		// indexes a different OR-search result set — must not resume.
		const otherSlug = encodeCursor({ v: 1, q: 'topic', args: { slug: 'technology' }, raw: 'nope' });
		await run('ai', otherSlug);

		expect(mockListDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});

	it('404s for an unknown slug before touching D1', async () => {
		await expect(run('no-such-topic')).rejects.toThrow();
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});
});

describe('topic page load ↔ resumer continuity', () => {
	it('page-1 load and the topic resumer issue the same query (same OR-search)', async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			profiles: [{ did: 'did:plc:a', handle: 'alice' }],
			cursor: 'keyset-p1'
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await run('technology');
		const p1 = mockListDiscoverable.mock.calls[0][1];
		// Page 1 derives the OR-search server-side from the slug.
		expect(p1.search).toBe('tech OR technology');
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'topic',
			args: { slug: 'technology' },
			raw: 'keyset-p1'
		});

		await runLoadMoreEvents(env, { cursor: result.cursor! });
		const p2 = mockListDiscoverable.mock.calls[1][1];

		// The comparison covers `search`, so it also pins that the resumer re-derived
		// the SAME 'tech OR technology' from the slug rather than trusting a client
		// value or drifting to another spelling of the query.
		expectSameQuery(p1, p2, 'keyset-p1');
	});
});
