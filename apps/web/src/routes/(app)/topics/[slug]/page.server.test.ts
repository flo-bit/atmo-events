import { afterEach, describe, expect, it, vi } from 'vitest';

// What this route decides for /topics/[slug]: the 404 for an unknown slug, which
// query it runs, the slug it records in the emitted envelope, and whether an
// inbound ?cursor= may be resumed. $lib/topics is left REAL so the OR-search is
// derived from the slug for real rather than stubbed.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
// queries.ts imports the search module at load time; the topic query never hits
// it, so a null-backend stub keeps the import deterministic.
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
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
	ongoing: unknown[];
	query: string;
};

// Two DIFFERENT queries reach listDiscoverable on this route, so a test must pick
// the one it means rather than trusting call order:
//   - the paginated TOPIC list — bounded `startsAtMin` (upcoming only)
//   - the ONGOING band         — bounded `startsAtMax` + `endsAtMin`
const paramsOf = (i: number) => mockListDiscoverable.mock.calls[i][1] as Record<string, unknown>;
const listCall = () =>
	mockListDiscoverable.mock.calls
		.map((_, i) => paramsOf(i))
		.find((p) => p.startsAtMin !== undefined);
const bandCall = () =>
	mockListDiscoverable.mock.calls.map((_, i) => paramsOf(i)).find((p) => p.endsAtMin !== undefined);

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

		const params = listCall()!;
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

		expect(listCall()).toMatchObject({ cursor: 'p2keyset' });
	});

	it('deep-link: ignores a foreign-query envelope (fresh page 1)', async () => {
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const foreign = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'nope' });
		await run('technology', foreign);

		expect(listCall()!.cursor).toBeUndefined();
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

		expect(listCall()!.cursor).toBeUndefined();
	});

	it('404s for an unknown slug before touching D1', async () => {
		await expect(run('no-such-topic')).rejects.toThrow();
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});
});

describe('topic ongoing band', () => {
	const emptyPage = () =>
		mockListDiscoverable.mockResolvedValue({
			records: [],
			profiles: [],
			cursor: null
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

	it('is scoped by the SAME slug-derived OR-search the list runs', async () => {
		emptyPage();
		await run('technology');

		const band = bandCall()!;
		// Server-derived from the slug by the same helper — never caller-supplied.
		expect(band.search).toBe('tech OR technology');
		expect(band).toMatchObject({ sort: 'endsAt', order: 'asc' });
		expect(band.startsAtMax).toBe(band.endsAtMin);
		expect(band.startsAtMin).toBeUndefined();
		expect(band.cursor).toBeUndefined();
	});

	it('does NOT re-send the band on a resumed continuation', async () => {
		emptyPage();
		const inbound = encodeCursor({
			v: 1,
			q: 'topic',
			args: { slug: 'technology' },
			raw: 'p2keyset'
		});
		const result = await run('technology', inbound);

		expect(bandCall()).toBeUndefined();
		expect(result.ongoing).toEqual([]);
	});
});
