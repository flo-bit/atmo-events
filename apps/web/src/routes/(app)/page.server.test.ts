import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/contrail/index', () => ({
	getServerClient: vi.fn(() => ({ get: vi.fn(async () => ({ ok: false })) }))
}));
vi.mock('$lib/contrail', () => ({
	listDiscoverableEventsFromContrail: vi.fn(),
	listEventRecordsFromContrail: vi.fn(),
	getHostProfile: vi.fn(),
	buildAttendee: vi.fn(),
	flattenEventRecord: vi.fn((r: unknown) => r),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	withD1Retry: vi.fn((fn: () => unknown) => fn())
}));
// Keep a spy to guard against reintroducing the unused homepage query.
vi.mock('$lib/contrail/ongoing', () => ({ ongoingQuery: vi.fn() }));
vi.mock('$lib/server/edge-cache', () => ({
	cachedRead: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn())
}));
vi.mock('$lib/spaces/config', () => ({ spacesAvailable: vi.fn(() => false) }));
vi.mock('$lib/spaces/server/client', () => ({ getSpacesClient: vi.fn(() => ({})) }));
vi.mock('$lib/dedupe-by-uri', () => ({ dedupeByUri: vi.fn((e: unknown[]) => e) }));

import { load } from './+page.server';
import { listDiscoverableEventsFromContrail } from '$lib/contrail';
import { ongoingQuery } from '$lib/contrail/ongoing';
import { cachedRead } from '$lib/server/edge-cache';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	recentActivity: unknown[];
	myUpcoming: unknown[];
	myPast: unknown[];
};

const event = {
	uri: 'at://a/1',
	did: 'did:plc:alice',
	rkey: '1',
	name: 'an event',
	startsAt: '2026-07-01T00:00:00Z',
	createdAt: '2026-06-01T00:00:00Z'
};
const request = () =>
	({ locals: {}, platform: { env: { DB: {} } } }) as unknown as Parameters<typeof load>[0];

beforeEach(() => {
	vi.clearAllMocks();
	mockDiscoverable.mockResolvedValue({
		records: [event],
		profiles: [{ did: 'did:plc:alice', handle: 'alice.test' }]
	} as never);
});

describe('home page load', () => {
	it('returns popular upcoming events with host handles', async () => {
		const data = (await load(request())) as unknown as LoadResult;
		expect(data.events).toEqual([event]);
		expect(data.handles).toEqual({ 'did:plc:alice': 'alice.test' });
		expect(mockDiscoverable.mock.calls[0][1]).toMatchObject({
			rsvpsCountMin: 2,
			sort: 'startsAt',
			order: 'asc',
			limit: 20
		});
	});

	it('does not fetch, cache, or return a happening-now section on the homepage', async () => {
		const data = await load(request());
		expect(ongoingQuery).not.toHaveBeenCalled();
		expect(vi.mocked(cachedRead).mock.calls.map(([key]) => key)).not.toContain('home:ongoing');
		expect(data).not.toHaveProperty('ongoing');
		expect(data).not.toHaveProperty('ongoingTotal');
		expect(data).not.toHaveProperty('ongoingTotalIsFloor');
	});

	it('still returns the other homepage sections when discovery is unavailable', async () => {
		mockDiscoverable.mockResolvedValue(null as never);
		const data = (await load(request())) as unknown as LoadResult;
		expect(data.events).toEqual([]);
		expect(data.handles).toEqual({});
		expect(data.myUpcoming).toEqual([]);
		expect(data.myPast).toEqual([]);
		expect(data.recentActivity).toEqual([]);
		expect(ongoingQuery).not.toHaveBeenCalled();
	});
});
