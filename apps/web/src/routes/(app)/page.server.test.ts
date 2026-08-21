import { beforeEach, describe, expect, it, vi } from 'vitest';

// What this route guarantees about the live band: the band is one of four
// independent reads gathered by a single Promise.all, so a band failure must
// degrade to an empty band rather than reject and take the whole home page down.
// The route already states the converse — the band survives a failed discovery
// read — and this pins the other direction.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({ get: vi.fn(async () => ({ ok: false })) })),
	listDiscoverableEventsFromContrail: vi.fn(),
	listEventRecordsFromContrail: vi.fn(),
	getHostProfile: vi.fn(),
	buildAttendee: vi.fn(),
	flattenEventRecord: vi.fn((r: unknown) => r),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	// pass-through: retry behaviour is not what this file is about
	withD1Retry: vi.fn((fn: () => unknown) => fn())
}));
vi.mock('$lib/contrail/ongoing', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/contrail/ongoing')>('$lib/contrail/ongoing');
	return { EMPTY_ONGOING: actual.EMPTY_ONGOING, ongoingQuery: vi.fn() };
});
// no edge cache in the test env: run the reader, don't memoize it
vi.mock('$lib/server/edge-cache', () => ({
	cachedRead: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn())
}));
vi.mock('$lib/dedupe-by-uri', () => ({ dedupeByUri: vi.fn((e: unknown[]) => e) }));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { ongoingQuery } from '$lib/contrail/ongoing';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);
const mockOngoing = vi.mocked(ongoingQuery);

type LoadResult = {
	events: unknown[];
	ongoing: unknown[];
	ongoingTotal: number;
	ongoingTotalIsFloor: boolean;
	handles: Record<string, string>;
	recentActivity: unknown[];
};

const event = (uri: string, rkey = '1') => ({
	uri,
	did: 'did:plc:alice',
	rkey,
	name: 'an event',
	startsAt: '2026-07-01T00:00:00Z',
	createdAt: '2026-06-01T00:00:00Z'
});

// anonymous visitor: skips the personalized branches, so the band and the
// discovery read are what remain
const request = () =>
	({ locals: {}, platform: { env: { DB: {} } } }) as unknown as Parameters<typeof load>[0];

beforeEach(() => {
	vi.clearAllMocks();
	mockDiscoverable.mockResolvedValue({
		records: [event('at://a/1')],
		profiles: [{ did: 'did:plc:alice', handle: 'alice.test' }]
	} as never);
	mockOngoing.mockResolvedValue({
		events: [event('at://live/1', '2')],
		handles: { 'did:plc:alice': 'alice.test' },
		total: 1,
		totalIsFloor: false
	});
});

describe('home page load', () => {
	it('returns the band when the band read succeeds', async () => {
		const data = (await load(request())) as unknown as LoadResult;

		expect(data.ongoing).toHaveLength(1);
		expect(data.ongoingTotal).toBe(1);
		expect(data.events).toHaveLength(1);
	});

	// The regression this guards: the band promise was gathered bare, so a thrown
	// band read rejected the Promise.all and the home page failed outright — even
	// though the discovery and activity reads beside it had succeeded.
	it('renders home with an empty band when the band read throws', async () => {
		mockOngoing.mockRejectedValue(new Error('D1 unavailable'));

		const data = (await load(request())) as unknown as LoadResult;

		expect(data.ongoing).toEqual([]);
		expect(data.ongoingTotal).toBe(0);
		expect(data.ongoingTotalIsFloor).toBe(false);
		// the discovery list still rendered, which is the whole point
		expect(data.events).toHaveLength(1);
	});

	// The band's own resilience must not depend on the discovery read, nor the
	// reverse — the route claims both directions, so test both.
	it('renders the band when the discovery read fails', async () => {
		mockDiscoverable.mockResolvedValue(null as never);

		const data = (await load(request())) as unknown as LoadResult;

		expect(data.events).toEqual([]);
		expect(data.ongoing).toHaveLength(1);
	});

	it('survives both reads failing at once', async () => {
		mockOngoing.mockRejectedValue(new Error('D1 unavailable'));
		mockDiscoverable.mockResolvedValue(null as never);

		const data = (await load(request())) as unknown as LoadResult;

		expect(data.events).toEqual([]);
		expect(data.ongoing).toEqual([]);
	});
});
