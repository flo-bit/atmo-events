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

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	cursor: string | null;
	ongoing: unknown[];
};
const runLoad = async (opts?: { filter?: string; cursor?: string }) =>
	(await load(event(opts))) as LoadResult;

// Two DIFFERENT queries reach listDiscoverable on this route, so a test must pick
// the one it means rather than trusting call order:
//   - the paginated LIST — bounded `startsAtMin` (upcoming only), carries a cursor
//   - the ONGOING band   — bounded `startsAtMax` + `endsAtMin`, never carries one
const paramsOf = (i: number) => mockDiscoverable.mock.calls[i][1] as Record<string, unknown>;
const listCall = () =>
	mockDiscoverable.mock.calls.map((_, i) => paramsOf(i)).find((p) => p.startsAtMin !== undefined);
const bandCall = () =>
	mockDiscoverable.mock.calls.map((_, i) => paramsOf(i)).find((p) => p.endsAtMin !== undefined);

afterEach(() => vi.clearAllMocks());

describe('events page load', () => {
	// The envelope names the query that minted it, so this also pins that the
	// route called the events query and not another one — a mis-wired route would
	// emit some other `q` here.
	it("mints an 'events' envelope carrying the popular scope", async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(); // no filter => popular

		expect(listCall()).toMatchObject({ rsvpsCountMin: 2 });
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

		expect(listCall()).not.toHaveProperty('rsvpsCountMin');
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: false },
			raw: 'keyset-all'
		});
	});
});

describe('events ongoing band', () => {
	it('runs alongside page 1, bounded to what is already under way', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-p1'));
		await runLoad();

		// Both bounds together ARE the band; the upcoming bound must not appear on
		// it, and it must sort soonest-ending first rather than longest-running.
		const band = bandCall()!;
		expect(band).toMatchObject({ sort: 'endsAt', order: 'asc' });
		expect(band.startsAtMax).toBe(band.endsAtMin);
		expect(band.startsAtMin).toBeUndefined();
		// Cursorless by construction — this is what leaves the list's keyset alone.
		expect(band.cursor).toBeUndefined();
	});

	it('runs on the all filter too — being under way is not a popularity question', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-all'));
		await runLoad({ filter: 'all' });
		expect(bandCall()).toBeDefined();
		expect(bandCall()).not.toHaveProperty('rsvpsCountMin');
	});

	it('does NOT re-send the band on a resumed continuation', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'p2keyset' });
		const result = await runLoad({ cursor: inbound });

		// Deeper in the keyset, the band's events are already above the reader.
		expect(bandCall()).toBeUndefined();
		expect(result.ongoing).toEqual([]);
	});

	it('DOES send it when a rejected envelope makes this a fresh page 1', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const foreign = encodeCursor({ v: 1, q: 'topic', args: { slug: 'music' }, raw: 'nope' });
		await runLoad({ cursor: foreign });

		// The band follows the VALIDATED cursor, not the inbound one: a rejected
		// envelope means page 1, and page 1 leads with what is on now.
		expect(bandCall()).toBeDefined();
	});
});

describe('events deep-link ?cursor= guard', () => {
	it('resumes an events envelope minted for the SAME popular filter', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'events', args: { popular: true }, raw: 'p2keyset' });
		await runLoad({ cursor: inbound }); // default load is popular
		expect(listCall()!.cursor).toBe('p2keyset');
	});

	it('ignores an events envelope minted for a DIFFERENT filter (same q, diff args => fresh page 1)', async () => {
		mockDiscoverable.mockResolvedValue(page(null));
		const otherArgs = encodeCursor({ v: 1, q: 'events', args: { popular: false }, raw: 'nope' });
		await runLoad({ cursor: otherArgs }); // default popular:true vs envelope popular:false
		expect(listCall()!.cursor).toBeUndefined();
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
		expect(listCall()!.cursor).toBeUndefined();
	});
});
