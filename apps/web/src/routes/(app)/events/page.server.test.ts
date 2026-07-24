import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Page 1 of /events comes from this route's load(); page 2 comes from the
// load-more registry's 'events' resumer. They are separate code paths that must
// issue the same discoverable query, so these drive both for real and compare
// what each one emitted.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
// events-load-more.ts imports the search module at load time; the events route
// never hits it, so a null-backend stub keeps the import deterministic.
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { runLoadMoreEvents } from '$lib/contrail/events-load-more';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';
import { FROZEN_NOW, expectSameQuery } from '$lib/contrail/continuity.test-utils';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

const env = { DB: {} } as unknown as App.Platform['env'];

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

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW }));
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('events page load ↔ resumer continuity', () => {
	it('page-1 load and the events resumer issue the same query (popular)', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(); // no filter => popular
		const p1 = mockDiscoverable.mock.calls[0][1];

		// The emitted envelope names the same server-side query + scope, carrying the
		// fresh keyset for the resumer to thread back in.
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: true },
			raw: 'keyset-p1'
		});

		await runLoadMoreEvents(env, { cursor: result.cursor! });
		const p2 = mockDiscoverable.mock.calls[1][1];

		expectSameQuery(p1, p2, 'keyset-p1');
	});

	it('page-1 load and the resumer both drop rsvpsCountMin for the all/non-popular filter', async () => {
		mockDiscoverable.mockResolvedValue(page('keyset-all'));
		const result = await runLoad({ filter: 'all' });
		const p1 = mockDiscoverable.mock.calls[0][1];
		expect(p1).not.toHaveProperty('rsvpsCountMin');
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: false },
			raw: 'keyset-all'
		});

		await runLoadMoreEvents(env, { cursor: result.cursor! });
		const p2 = mockDiscoverable.mock.calls[1][1];
		expect(p2).not.toHaveProperty('rsvpsCountMin');

		expectSameQuery(p1, p2, 'keyset-all');
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
