import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Page 1 of /p/[actor]/hosting comes from this route's load(); page 2 comes from
// the load-more registry's 'hosting' resumer. They are separate code paths that
// must issue the same authored + upcoming query, scoped to the same actor, so
// these drive both for real and compare what each one emitted.
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

type LoadResult = { events: unknown[]; cursor: string | null };
const runLoad = async (actor: string, cursor?: string) =>
	(await load(event(actor, cursor))) as LoadResult;

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW }));
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('hosting page load ↔ resumer continuity', () => {
	it('page-1 load and the hosting resumer issue the same query', async () => {
		mockAuthored.mockResolvedValue(page('keyset-p1'));
		const result = await runLoad(ACTOR);
		const p1 = mockAuthored.mock.calls[0][1];

		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'hosting',
			args: { actor: ACTOR },
			raw: 'keyset-p1'
		});

		await runLoadMoreEvents(env, { cursor: result.cursor! });
		const p2 = mockAuthored.mock.calls[1][1];

		expectSameQuery(p1, p2, 'keyset-p1');
	});
});

describe('hosting deep-link ?cursor= guard', () => {
	it('resumes a hosting envelope minted for THIS actor', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const inbound = encodeCursor({ v: 1, q: 'hosting', args: { actor: ACTOR }, raw: 'p2keyset' });
		await runLoad(ACTOR, inbound);
		expect(mockAuthored.mock.calls[0][1].cursor).toBe('p2keyset');
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
		expect(mockAuthored.mock.calls[0][1].cursor).toBeUndefined();
	});

	it('ignores a foreign-query (past-events) envelope even for the same actor (fresh page 1)', async () => {
		mockAuthored.mockResolvedValue(page(null));
		const foreign = encodeCursor({ v: 1, q: 'past-events', args: { actor: ACTOR }, raw: 'nope' });
		await runLoad(ACTOR, foreign);
		expect(mockAuthored.mock.calls[0][1].cursor).toBeUndefined();
	});
});
