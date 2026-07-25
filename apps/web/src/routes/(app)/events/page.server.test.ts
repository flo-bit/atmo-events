import { afterEach, describe, expect, it, vi } from 'vitest';

// What this route decides for /events: which query it runs, the scope it derives
// from ?filter= and records in the emitted envelope, and whether an inbound
// ?cursor= may be resumed. The query body it calls — discoverable, upcoming, asc
// — is pinned in lib/contrail/events-load-more.test.ts.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
// queries.ts imports the search module at load time; the events query never hits
// it, so a null-backend stub keeps the import deterministic.
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

function event(opts?: { filter?: string; cursor?: string }) {
	const url = new URL('https://atmo.test/events');
	if (opts?.filter) url.searchParams.set('filter', opts.filter);
	if (opts?.cursor) url.searchParams.set('cursor', opts.cursor);
	return { url, platform: { env: { DB: {} } } } as unknown as Parameters<typeof load>[0];
}

const page = (cursor: string | null) =>
	({
		records: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
		profiles: [{ did: 'did:plc:a', handle: 'alice' }],
		cursor
	}) as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>;

type LoadResult = { events: unknown[]; handles: Record<string, string>; cursor: string | null };
const runLoad = async (opts?: { filter?: string; cursor?: string }) =>
	(await load(event(opts))) as LoadResult;

afterEach(() => vi.clearAllMocks());

describe('events page load', () => {
	// The envelope names the query that minted it, so this also pins that the
	// route called the events query and not another one — a mis-wired route would
	// emit some other `q` here.
	it("mints an 'events' envelope carrying the popular scope", async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(); // no filter => popular

		expect(mockDiscoverable.mock.calls[0][1]).toMatchObject({ rsvpsCountMin: 2 });
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: true },
			raw: 'keyset-p1'
		});
	});

	it('drops rsvpsCountMin for the all/non-popular filter and says so in the envelope', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-all'));
		const result = await runLoad({ filter: 'all' });

		expect(mockDiscoverable.mock.calls[0][1]).not.toHaveProperty('rsvpsCountMin');
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: false },
			raw: 'keyset-all'
		});
	});
});

describe('events deep-link ?cursor= guard', () => {
	it('resumes an events envelope minted for the SAME popular filter', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'p2keyset' });
		await runLoad({ cursor: inbound }); // default load is popular
		expect(mockDiscoverable.mock.calls[0][1].cursor).toBe('p2keyset');
	});

	it('ignores an events envelope minted for a DIFFERENT filter (same q, diff args => fresh page 1)', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const otherArgs = encodeCursor({ v: 1, q: 'events', args: { popular: false }, raw: 'nope' });
		await runLoad({ cursor: otherArgs }); // default popular:true vs envelope popular:false
		expect(mockDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});

	it('ignores a foreign-query envelope (fresh page 1)', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const foreign = encodeCursor({
			v: 1,
			q: 'hosting',
			args: { actor: 'did:plc:alice' },
			raw: 'nope'
		});
		await runLoad({ cursor: foreign });
		expect(mockDiscoverable.mock.calls[0][1].cursor).toBeUndefined();
	});
});
