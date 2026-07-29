import { afterEach, describe, expect, it, vi } from 'vitest';

// What this route decides for /p/[actor]/hosting: which query it runs, the actor
// scope it records in the emitted envelope, and whether an inbound ?cursor= may
// be resumed. The query body — authored, upcoming, asc — is pinned in
// lib/contrail/events-load-more.test.ts.
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
import { ONGOING_PER_ACTOR } from '$lib/contrail/ongoing';

const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);

const ACTOR = 'did:plc:alice';

function event(actor: string, cursor?: string) {
	const url = new URL(`https://atmo.test/p/${actor}/hosting`);
	if (cursor) url.searchParams.set('cursor', cursor);
	return {
		params: { actor },
		url,
		platform: { env: { DB: {} } }
	} as unknown as Parameters<typeof load>[0];
}

const page = (cursor: string | null) =>
	({
		records: [{ uri: 'at://did:plc:alice/community.lexicon.calendar.event/1' }],
		profiles: [{ did: ACTOR, handle: 'alice' }],
		cursor
	}) as unknown as Awaited<ReturnType<typeof listAuthoredEventsFromContrail>>;

type LoadResult = { events: unknown[]; cursor: string | null; ongoing: unknown[] };
const runLoad = async (actor: string, cursor?: string) =>
	(await load(event(actor, cursor))) as LoadResult;

// Two DIFFERENT queries reach listAuthored on this route, so a test must pick the
// one it means rather than trusting call order:
//   - the paginated HOSTING list — bounded `startsAtMin` (upcoming only)
//   - the ONGOING band           — bounded `startsAtMax` + `endsAtMin`
const paramsOf = (i: number) => mockAuthored.mock.calls[i][1] as Record<string, unknown>;
const listCall = () =>
	mockAuthored.mock.calls.map((_, i) => paramsOf(i)).find((p) => p.startsAtMin !== undefined);
const bandCall = () =>
	mockAuthored.mock.calls.map((_, i) => paramsOf(i)).find((p) => p.endsAtMin !== undefined);

afterEach(() => vi.clearAllMocks());

describe('hosting page load', () => {
	// The envelope names the query that minted it, so this also pins that the
	// route called the hosting query — the past-events one would say so here.
	it("mints a 'hosting' envelope scoped to this actor", async () => {
		mockAuthored.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(ACTOR);

		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'hosting',
			args: { actor: ACTOR },
			raw: 'keyset-p1'
		});
	});
});

describe('hosting ongoing band', () => {
	// More of one actor's live events than the shared-list cap would allow through.
	const manyLive = (n: number) =>
		({
			records: Array.from({ length: n }, (_, i) => ({
				uri: `at://did:plc:alice/community.lexicon.calendar.event/${i}`,
				did: ACTOR
			})),
			profiles: [{ did: ACTOR, handle: 'alice' }],
			cursor: null
		}) as unknown as Awaited<ReturnType<typeof listAuthoredEventsFromContrail>>;

	it('runs the band UNCAPPED — this page is where the shared lists’ "see all" lands', async () => {
		mockAuthored.mockResolvedValue(manyLive(ONGOING_PER_ACTOR + 2));
		const result = await runLoad(ACTOR);

		expect(bandCall()).toMatchObject({ actor: ACTOR, sort: 'endsAt', order: 'asc' });
		// A per-actor cap here would send a reader chasing the rest of a publisher's
		// live events to a page showing the same three they were escaping.
		expect(result.ongoing.length).toBeGreaterThan(ONGOING_PER_ACTOR);
	});

	it('does NOT re-send the band on a resumed continuation', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'hosting', args: { actor: ACTOR }, raw: 'p2keyset' });
		const result = await runLoad(ACTOR, inbound);

		expect(bandCall()).toBeUndefined();
		expect(result.ongoing).toEqual([]);
	});
});

describe('hosting deep-link ?cursor= guard', () => {
	it('resumes a hosting envelope minted for THIS actor', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'hosting', args: { actor: ACTOR }, raw: 'p2keyset' });
		await runLoad(ACTOR, inbound);
		expect(listCall()!.cursor).toBe('p2keyset');
	});

	it('ignores a hosting envelope minted for a DIFFERENT actor (same q, diff args => fresh page 1)', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const otherActor = encodeCursor({
			v: 1,
			q: 'hosting',
			args: { actor: 'did:plc:bob' },
			raw: 'nope'
		});
		await runLoad(ACTOR, otherActor);
		expect(listCall()!.cursor).toBeUndefined();
	});

	it('ignores a foreign-query (past-events) envelope even for the same actor (fresh page 1)', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const foreign = encodeCursor({ v: 1, q: 'past-events', args: { actor: ACTOR }, raw: 'nope' });
		await runLoad(ACTOR, foreign);
		expect(listCall()!.cursor).toBeUndefined();
	});
});
