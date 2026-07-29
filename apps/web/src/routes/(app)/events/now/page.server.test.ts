import { afterEach, describe, expect, it, vi } from 'vitest';

// What this route decides for /events/now: the two bounds that make a list of
// what is under way, the sort that puts the soonest-finishing first, and whether
// an inbound ?cursor= may be resumed. This page is the destination every capped
// "happening now" block links to, so the property that matters most is that it
// caps NOTHING: no per-host limit, no ceiling, just a page of the whole set.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn(),
	runOngoingSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';
import { runOngoingSearchPage, searchBackendFromEnv } from '$lib/search/server/query';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);
const mockBackend = vi.mocked(searchBackendFromEnv);
const mockOngoingSearch = vi.mocked(runOngoingSearchPage);

function event(cursor?: string, scope?: Record<string, string>) {
	const url = new URL('https://atmo.test/events/now');
	if (cursor) url.searchParams.set('cursor', cursor);
	for (const [k, v] of Object.entries(scope ?? {})) url.searchParams.set(k, v);
	return { url, platform: { env: { DB: {} } } } as unknown as Parameters<typeof load>[0];
}

const page = (cursor: string | null) =>
	({
		records: [
			{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1', did: 'did:plc:a' },
			{ uri: 'at://did:plc:a/community.lexicon.calendar.event/2', did: 'did:plc:a' },
			{ uri: 'at://did:plc:b/community.lexicon.calendar.event/3', did: 'did:plc:b' }
		],
		profiles: [{ did: 'did:plc:a', handle: 'alice' }],
		cursor
	}) as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>;

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	cursor: string | null;
	scopeLabel?: string;
	term?: string;
	slug?: string;
};
const runLoad = async (cursor?: string, scope?: Record<string, string>) =>
	(await load(event(cursor, scope))) as LoadResult;

afterEach(() => vi.clearAllMocks());

describe('happening-now page load', () => {
	it('bounds BOTH ends and sorts soonest-ending first', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-p1'));
		await runLoad();

		const params = mockDiscoverable.mock.calls[0][1];
		expect(params).toMatchObject({ sort: 'endsAt', order: 'asc', profiles: true, limit: 20 });
		// Same instant for both, so the window can neither gap nor overlap itself.
		expect(params.startsAtMax).toBe(params.endsAtMin);
		// The upcoming feed's bound excludes everything this page exists to show.
		expect(params.startsAtMin).toBeUndefined();
	});

	it('caps nothing — a host with several live events keeps them all', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const result = await runLoad();

		// Two of the three records belong to one host. The shared lists show one and
		// count the rest; this page is where that remainder has to be reachable, so
		// nothing here may collapse them.
		expect(result.events).toHaveLength(3);
	});

	it('mints a happening-now envelope so load-more continues THIS list', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad();

		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'happening-now', raw: 'keyset-p1' });
	});

	it('ends cleanly (cursor:null) on a genuinely last page', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		expect((await runLoad()).cursor).toBeNull();
	});

	it('deep-link: resumes its own envelope by feeding the raw keyset to D1', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'happening-now', raw: 'p2keyset' });
		await runLoad(inbound);

		expect(mockDiscoverable.mock.calls[0][1].cursor).toBe('p2keyset');
	});

	it('deep-link: ignores a foreign-query envelope (fresh page 1)', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		// An 'events' keyset indexes a startsAt-sorted set; resuming it here would
		// walk a different order entirely.
		const foreign = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'nope' });
		await runLoad(foreign);

		expect(mockDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});
});

describe('/events/now scope', () => {
	// A band beside a scoped list counts that scope ("See all 2" on a search for
	// "town"). If this page ignored the scope the number would describe one set and
	// the page would show another — which is what it did before.
	it('is unscoped by default — no search filter reaches the query', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		await load(event());
		expect(mockDiscoverable.mock.calls[0][1]).not.toHaveProperty('search');
	});

	it('scopes by a free-text term from ?q=', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const result = await runLoad(undefined, { q: 'town' });
		expect(mockDiscoverable.mock.calls[0][1]).toMatchObject({ search: 'town' });
		expect(result.scopeLabel).toBe('town');
	});

	it('refuses to resume a cursor when a term is present', async () => {
		// The term rides ?q=, not the envelope, so a cursor cannot be proven to
		// belong to this list — the same rule /search follows.
		mockDiscoverable.mockResolvedValue(page(null));
		const token = encodeCursor({ v: 1, q: 'happening-now', raw: 'keyset-42' });
		await load(event(token, { q: 'town' }));
		// The param is passed as `cursor: undefined`, so assert the VALUE, not the key.
		expect((mockDiscoverable.mock.calls[0][1] as Record<string, unknown>).cursor).toBeUndefined();
	});

	it('derives a topic scope from the slug server-side and binds it to the cursor', async () => {
		mockDiscoverable.mockResolvedValue(page('raw-cursor'));
		const result = await runLoad(undefined, { topic: 'music' });
		const params = mockDiscoverable.mock.calls[0][1] as Record<string, unknown>;
		// The search text is re-derived from the slug, never taken from the client.
		expect(typeof params.search).toBe('string');
		expect(params.search).not.toBe('music');
		// The slug is public-safe, so it rides in the envelope and can be matched.
		expect(decodeCursor(result.cursor)).toMatchObject({
			q: 'happening-now',
			args: { slug: 'music' }
		});
	});

	it('ends cleanly for an unknown topic slug', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const result = await runLoad(undefined, { topic: 'not-a-topic' });
		// Unknown slug => unscoped rather than a bogus search.
		expect(result.scopeLabel).toBeUndefined();
	});
});

describe('/events/now term scope runs the backend the band ran', () => {
	// A term-scoped band sits beside a Meili-ranked list and promotes live events
	// out of it. If this page ran D1 while the band ran Meili it could not contain
	// what the band was already showing, and "see all" would lead somewhere
	// smaller. Measured on testnet before this: a band of 2 linking to a page of 1.
	const backend = { url: 'https://meili.test', apiKey: 'k' };

	it('routes a free-text term to the search backend, not D1', async () => {
		mockBackend.mockReturnValue(backend);
		mockOngoingSearch.mockResolvedValue({
			events: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			handles: { 'did:plc:a': 'alice' },
			cursor: null,
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runOngoingSearchPage>>);

		const result = await runLoad(undefined, { q: 'town' });

		expect(mockOngoingSearch).toHaveBeenCalledWith(backend, expect.anything(), { q: 'town' });
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(result.scopeLabel).toBe('town');
	});

	it('falls back to D1 when the backend is unconfigured', async () => {
		mockBackend.mockReturnValue(null);
		mockDiscoverable.mockResolvedValue(page(null));

		await runLoad(undefined, { q: 'town' });

		expect(mockOngoingSearch).not.toHaveBeenCalled();
		expect(mockDiscoverable.mock.calls[0][1]).toMatchObject({ search: 'town' });
	});

	it('keeps a TOPIC on D1 — both sides derive it from the slug, so they agree', async () => {
		mockBackend.mockReturnValue(backend);
		mockDiscoverable.mockResolvedValue(page(null));

		await runLoad(undefined, { topic: 'music' });

		expect(mockOngoingSearch).not.toHaveBeenCalled();
		expect(mockDiscoverable).toHaveBeenCalled();
	});
});

describe('the scope goes back to the client', () => {
	// Two things need it. "Upcoming events →" is the one link out of a scoped list,
	// and hardcoded to /events it dropped a reader who arrived from a search for
	// `town` into the global upcoming feed. Load-more needs the TERM specifically:
	// it rides the remote input rather than the cursor envelope, so a page that
	// keeps the term to itself cannot advance past its first 20 results.
	it('returns a free-text term apart from the display label', async () => {
		mockBackend.mockReturnValue(null);
		mockDiscoverable.mockResolvedValue(page(null));

		const result = await runLoad(undefined, { q: 'town' });
		expect(result.term).toBe('town');
		expect(result.slug).toBeUndefined();
	});

	it('returns a topic SLUG, not the display name the label carries', async () => {
		mockDiscoverable.mockResolvedValue(page(null));

		const result = await runLoad(undefined, { topic: 'music' });
		// scopeLabel is for reading; the slug is what a link can be built from.
		expect(result.slug).toBe('music');
		expect(result.scopeLabel).toBe('Music');
		expect(result.term).toBeUndefined();
	});

	it('withholds the slug for an unknown topic, so no link is built from it', async () => {
		mockDiscoverable.mockResolvedValue(page(null));

		const result = await runLoad(undefined, { topic: 'not-a-topic' });
		expect(result.slug).toBeUndefined();
		expect(result.term).toBeUndefined();
	});

	it('returns neither for an unscoped page', async () => {
		mockDiscoverable.mockResolvedValue(page(null));

		const result = await runLoad();
		expect(result.term).toBeUndefined();
		expect(result.slug).toBeUndefined();
	});
});
