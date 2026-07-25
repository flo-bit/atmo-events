import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What this route decides for /p/[actor]/past-events: which query it runs, the
// actor scope it records in the emitted envelope, and whether an inbound ?cursor=
// may be resumed. Plus the one result-shaping rule that is easy to get wrong —
// the upper time bound admits an event that is still running, so the query
// excludes it.
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
import { listAuthoredEventsFromContrail } from '$lib/contrail';
import { decodeCursor, encodeCursor } from '$lib/contrail/cursor';

const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);

// Frozen so ENDED/ONGOING sit deterministically either side of "now".
const FROZEN_NOW = new Date('2026-06-01T12:00:00.000Z');
const ACTOR = 'did:plc:alice';

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
// Began before the frozen clock but has NOT finished; the startsAtMax bound
// admits it, so the query has to exclude it.
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

describe('past-events page load', () => {
	it("mints a 'past-events' envelope, bounded ABOVE by now", async () => {
		mockAuthored.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(ACTOR);

		// The past query is bounded above by now, not below — the one route where
		// swapping the bound would still look plausible.
		const p1 = mockAuthored.mock.calls[0][1];
		expect(typeof p1.startsAtMax).toBe('string');
		expect(p1.startsAtMin).toBeUndefined();
		expect(p1.order).toBe('desc');

		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'past-events',
			args: { actor: ACTOR },
			raw: 'keyset-p1'
		});
	});

	// startsAtMax admits an event that began earlier and is still running, so the
	// query narrows the result after the read. Every page inherits that narrowing
	// because there is one query — an ongoing event cannot be dropped from one
	// page and resurface on the next.
	it('excludes an event that is still running', async () => {
		mockAuthored.mockResolvedValue(page('keyset-p1', [ONGOING, ENDED]));

		const result = await runLoad(ACTOR);

		expect(result.events).toEqual([ENDED]);
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
