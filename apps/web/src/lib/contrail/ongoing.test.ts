import { afterEach, describe, expect, it, vi } from 'vitest';

// The ongoing band — events in `startsAt <= now < endsAt`, the one window that
// neither the upcoming feed (bounded startsAtMin: now) nor past-events (bounded
// startsAtMax: now, then narrowed by hasEnded) ever served.
//
// These tests pin the properties that make it safe to merge into an existing
// list: (1) the two bounds ARE the band, (2) the sort is endsAt ASC — soonest-
// ending first, the inverse of what widening the feed's own bound would produce,
// (3) no cursor is ever minted, so no keyset can drift, (4) the per-actor cap
// withholds and COUNTS rather than silently dropping.

vi.mock('$lib/contrail', () => ({
	flattenEventRecords: vi.fn((records: { value: unknown; did: string }[]) =>
		records.map((r) => ({ ...(r.value as object), did: r.did }))
	),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));

import { capPerActor, ongoingQuery, ONGOING_PER_ACTOR, ONGOING_SCOPED_MAX } from './ongoing';
import { listAuthoredEventsFromContrail, listDiscoverableEventsFromContrail } from '$lib/contrail';
import type { FlatEventRecord } from '@atmo-dev/events-ui';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);
const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);

const client = {} as never;

/** An event record as contrail returns it, before flattening. */
const rec = (did: string, name: string, endsAt = '2026-07-26T00:00:00Z') => ({
	did,
	value: { name, startsAt: '2026-07-25T10:00:00Z', endsAt }
});

const page = (records: unknown[], profiles: unknown[] = []) =>
	({ records, profiles, cursor: 'a-keyset-we-must-ignore' }) as unknown as Awaited<
		ReturnType<typeof listDiscoverableEventsFromContrail>
	>;

/** Flat events for the pure cap tests. */
const ev = (did: string, name: string) => ({ did, name }) as unknown as FlatEventRecord;

afterEach(() => vi.clearAllMocks());

describe('capPerActor', () => {
	it('keeps every event when no actor exceeds the limit', () => {
		const events = [ev('did:a', '1'), ev('did:b', '2'), ev('did:a', '3')];
		const kept = capPerActor(events, 3);
		expect(kept).toHaveLength(3);
	});

	it('withholds beyond the limit and counts what it withheld, per actor', () => {
		const events = [
			...Array.from({ length: 26 }, (_, i) => ev('did:loud', `loud-${i}`)),
			...Array.from({ length: 5 }, (_, i) => ev('did:mid', `mid-${i}`)),
			ev('did:quiet', 'quiet-0')
		];
		const kept = capPerActor(events, 3);

		// 3 + 3 + 1 survive; the rest are counted, not dropped on the floor.
		expect(kept).toHaveLength(7);
	});

	it('keeps each actor FIRST-n, so an endsAt-asc input keeps the soonest-ending', () => {
		const events = [
			ev('did:a', 'ends-first'),
			ev('did:a', 'ends-second'),
			ev('did:a', 'ends-third'),
			ev('did:a', 'ends-fourth')
		];
		const kept = capPerActor(events, 3);
		expect(kept.map((e) => e.name)).toEqual(['ends-first', 'ends-second', 'ends-third']);
	});

	it('preserves the caller’s interleaved order rather than grouping by actor', () => {
		const events = [ev('did:a', 'a1'), ev('did:b', 'b1'), ev('did:a', 'a2')];
		const kept = capPerActor(events, 3);
		expect(kept.map((e) => e.name)).toEqual(['a1', 'b1', 'a2']);
	});

	it('defaults to ONGOING_PER_ACTOR', () => {
		const events = Array.from({ length: 10 }, (_, i) => ev('did:a', `${i}`));
		expect(capPerActor(events)).toHaveLength(ONGOING_PER_ACTOR);
	});

	it('handles an empty list', () => {
		expect(capPerActor([], 3)).toEqual([]);
	});
});

describe('ongoingQuery bounds', () => {
	it('bounds BOTH ends — startsAtMax and endsAtMin together are the band', async () => {
		mockDiscoverable.mockResolvedValue(page([]));
		await ongoingQuery(client);

		const params = mockDiscoverable.mock.calls[0][1];
		expect(params.startsAtMax).toBeTruthy();
		expect(params.endsAtMin).toBeTruthy();
		// Same instant for both, so the band can neither gap nor overlap itself.
		expect(params.startsAtMax).toBe(params.endsAtMin);
		// The bound the upcoming feed uses must NOT appear — that one excludes the
		// entire band and is the bug being fixed.
		expect(params.startsAtMin).toBeUndefined();
	});

	it('sorts by endsAt ASC — soonest-ending first', async () => {
		mockDiscoverable.mockResolvedValue(page([]));
		await ongoingQuery(client);

		const params = mockDiscoverable.mock.calls[0][1];
		expect(params.sort).toBe('endsAt');
		// Explicit: a range field defaults to `desc` in contrail's router, which
		// would put the longest-running events first — the exact inversion this
		// whole approach exists to avoid.
		expect(params.order).toBe('asc');
	});

	it('never mints a cursor, so no keyset can drift', async () => {
		mockDiscoverable.mockResolvedValue(page([rec('did:a', 'x')]));
		const result = await ongoingQuery(client);

		// The response carries a keyset; the band deliberately discards it.
		expect(result).not.toHaveProperty('cursor');
		expect(mockDiscoverable.mock.calls[0][1]).not.toHaveProperty('cursor');
	});

	it('scopes to one actor via listAuthored when given one, else listDiscoverable', async () => {
		mockAuthored.mockResolvedValue(page([]));
		await ongoingQuery(client, { actor: 'alice.test' as never });
		expect(mockAuthored).toHaveBeenCalled();
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(mockAuthored.mock.calls[0][1].actor).toBe('alice.test');

		vi.clearAllMocks();
		mockDiscoverable.mockResolvedValue(page([]));
		await ongoingQuery(client);
		expect(mockDiscoverable).toHaveBeenCalled();
		expect(mockAuthored).not.toHaveBeenCalled();
	});

	it('returns an empty band when contrail is unreachable', async () => {
		mockDiscoverable.mockResolvedValue(null);
		const result = await ongoingQuery(client);
		expect(result.events).toEqual([]);
		expect(result.handles).toEqual({});
	});
});

describe('ongoingQuery scope decides whether the per-host cap applies', () => {
	// Two live events, same host. On a global surface the cap keeps one — that is
	// the point of the cap. On a band the reader scoped themselves, keeping one is
	// wrong: they asked for this set.
	const sameHost = [ev('did:loud', '1'), ev('did:loud', '2')];

	it('caps per host when the band is unscoped', async () => {
		mockDiscoverable.mockResolvedValue(page(sameHost));
		const result = await ongoingQuery(client);
		expect(result.events).toHaveLength(1);
		// ...and says so, so the block cannot read as the complete list.
		expect(result.total).toBe(2);
	});

	it('does NOT cap per host when scoped by a search term', async () => {
		mockDiscoverable.mockResolvedValue(page(sameHost));
		const result = await ongoingQuery(client, { search: 'town' });
		expect(result.events).toHaveLength(2);
		// events === total, so the section needs no "See all N" at all.
		expect(result.total).toBe(2);
	});

	it('still bounds a scoped band, and reports the total when it bites', async () => {
		const many = Array.from({ length: 9 }, (_, i) => ev('did:loud', `${i}`));
		mockDiscoverable.mockResolvedValue(page(many));
		const result = await ongoingQuery(client, { search: 'broad' });
		expect(result.events).toHaveLength(ONGOING_SCOPED_MAX);
		expect(result.total).toBe(9);
	});
});
