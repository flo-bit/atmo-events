import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Page 1 of /p/[actor]/past-events comes from this route's load(); page 2 comes
// from the load-more registry's 'past-events' resumer. They are separate code
// paths that must issue the same authored + past query — desc order under a
// startsAtMax upper bound, not startsAtMin — so these drive both for real and
// compare what each one emitted.
vi.mock('$lib/actor', () => ({
	getActor: vi.fn(async () => 'did:plc:alice')
}));
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	getProfileFromContrail: vi.fn(async () => ({})),
	listAuthoredEventsFromContrail: vi.fn(),
	listDiscoverableEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { runLoadMoreEvents } from '$lib/contrail/events-load-more';
import { listAuthoredEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';
import { FROZEN_NOW, expectSameQuery } from '$lib/contrail/continuity.test-utils';

const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);

const ACTOR = 'did:plc:alice';
const env = { DB: {} } as unknown as App.Platform['env'];

function event(actor: string, cursor?: string) {
	const url = new URL(`https://atmo.test/p/${actor}/past-events`);
	if (cursor) url.searchParams.set('cursor', cursor);
	return {
		params: { actor },
		url,
		platform: { env: { DB: {} } }
	} as unknown as Parameters<typeof load>[0];
}

// Genuinely over before the frozen clock.
const ENDED = {
	uri: 'at://did:plc:alice/community.lexicon.calendar.event/1',
	startsAt: '2000-01-01T00:00:00Z'
};
// Began before the frozen clock but has NOT finished. The startsAtMax bound
// admits it, so both sides have to exclude it themselves.
const ONGOING = {
	uri: 'at://did:plc:alice/community.lexicon.calendar.event/ongoing',
	startsAt: '2000-01-01T00:00:00Z',
	endsAt: '2030-01-01T00:00:00Z'
};

const page = (cursor: string | null, records: unknown[] = [ENDED]) =>
	({
		records,
		profiles: [{ did: ACTOR, handle: 'alice' }],
		cursor
	}) as unknown as Awaited<ReturnType<typeof listAuthoredEventsFromContrail>>;

type LoadResult = { events: unknown[]; cursor: string | null };
const runLoad = async (actor: string, cursor?: string) =>
	(await load(event(actor, cursor))) as LoadResult;

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW }));
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('past-events page load ↔ resumer continuity', () => {
	it('page-1 load and the past-events resumer issue the same query (desc, startsAtMax)', async () => {
		mockAuthored.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(ACTOR);
		const p1 = mockAuthored.mock.calls[0][1];
		// The past query is bounded ABOVE by now, not below — the one route where
		// swapping the bound would still look plausible.
		expect(typeof p1.startsAtMax).toBe('string');
		expect(p1.startsAtMin).toBeUndefined();
		expect(p1.order).toBe('desc');

		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'past-events',
			args: { actor: ACTOR },
			raw: 'keyset-p1'
		});

		await runLoadMoreEvents(env, { cursor: result.cursor! });
		const p2 = mockAuthored.mock.calls[1][1];

		expectSameQuery(p1, p2, 'keyset-p1');
	});

	// Matching query bags are not enough here: this route also narrows the
	// RESULT after the query returns. If only page 1 did that, an event that is
	// still running would be filtered off page 1 and then resurface on page 2 of
	// "past events".
	it('page-1 load and the resumer both exclude an event that is still running', async () => {
		mockAuthored.mockResolvedValue(page('keyset-p1', [ONGOING, ENDED]));

		const result = await runLoad(ACTOR);
		expect(result.events).toEqual([ENDED]);

		const page2 = await runLoadMoreEvents(env, { cursor: result.cursor! });
		expect(page2.events).toEqual([ENDED]);
	});
});

describe('past-events deep-link ?cursor= guard', () => {
	it('resumes a past-events envelope minted for THIS actor', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const inbound = encodeCursor({
			v: 1,
			q: 'past-events',
			args: { actor: ACTOR },
			raw: 'p2keyset'
		});
		await runLoad(ACTOR, inbound);
		expect(mockAuthored.mock.calls[0][1].cursor).toBe('p2keyset');
	});

	it('ignores a past-events envelope minted for a DIFFERENT actor (same q, diff args => fresh page 1)', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const otherActor = encodeCursor({
			v: 1,
			q: 'past-events',
			args: { actor: 'did:plc:bob' },
			raw: 'nope'
		});
		await runLoad(ACTOR, otherActor);
		expect(mockAuthored.mock.calls[0][1].cursor).toBeUndefined();
	});

	it('ignores a foreign-query (hosting) envelope even for the same actor (fresh page 1)', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const foreign = encodeCursor({ v: 1, q: 'hosting', args: { actor: ACTOR }, raw: 'nope' });
		await runLoad(ACTOR, foreign);
		expect(mockAuthored.mock.calls[0][1].cursor).toBeUndefined();
	});
});
