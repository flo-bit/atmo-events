import { afterEach, describe, expect, it, vi } from 'vitest';

// The topic page used to return cursor:null (first-batch-only) because load-more
// had no safe way to re-run its discoverable + OR-search + startsAtMin query.
// The envelope closes that gap: the load now emits a self-describing 'topic'
// envelope carrying the slug, and the load-more registry re-derives the SAME
// OR-search from that slug server-side. These pin the page-1 side of that
// continuity plus the deep-link query-match rule.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn()
}));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';

const mockListDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

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

afterEach(() => vi.clearAllMocks());

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

		const inbound = encodeCursor({ v: 1, q: 'topic', args: { slug: 'technology' }, raw: 'p2keyset' });
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

	it("deep-link: ignores a topic envelope minted for a DIFFERENT slug (fresh page 1)", async () => {
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
