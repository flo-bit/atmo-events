import { beforeEach, describe, expect, it, vi } from 'vitest';

// What this route guarantees about the live band: it is an OPTIONAL section
// gathered by the same Promise.all as the reads a profile cannot render without,
// so a band failure must degrade to an empty band rather than reject and turn a
// valid profile into an error page. The band's own query body is pinned in
// lib/contrail/ongoing.test.ts.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	getProfileFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn(),
	listAttendingEventsFromContrail: vi.fn(),
	flattenEventRecords: vi.fn((records: unknown[]) => records)
}));
vi.mock('$lib/contrail/ongoing', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/contrail/ongoing')>('$lib/contrail/ongoing');
	return { EMPTY_ONGOING: actual.EMPTY_ONGOING, ongoingQuery: vi.fn() };
});
vi.mock('$lib/actor', () => ({ getActor: vi.fn(async () => 'did:plc:alice') }));
vi.mock('$lib/spaces/config', () => ({ spacesAvailable: vi.fn(() => false) }));
vi.mock('$lib/spaces/server/client', () => ({ getSpacesClient: vi.fn(() => ({})) }));
vi.mock('$lib/past-events', () => ({ hasEnded: vi.fn(() => true) }));

import { load } from './+page.server';
import {
	getProfileFromContrail,
	listAttendingEventsFromContrail,
	listAuthoredEventsFromContrail
} from '$lib/contrail';
import { ongoingQuery } from '$lib/contrail/ongoing';

const mockProfile = vi.mocked(getProfileFromContrail);
const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);
const mockAttending = vi.mocked(listAttendingEventsFromContrail);
const mockOngoing = vi.mocked(ongoingQuery);

type LoadResult = {
	ongoingEvents: unknown[];
	ongoingTotal: number;
	ongoingTotalIsFloor: boolean;
	upcomingEvents: unknown[];
	actorProfile: unknown;
	actorDid: string;
};

const event = (uri: string, rkey = '1') => ({
	uri,
	did: 'did:plc:alice',
	rkey,
	name: 'an event',
	startsAt: '2026-07-01T00:00:00Z',
	createdAt: '2026-06-01T00:00:00Z'
});

function request() {
	return {
		params: { actor: 'alice.test' },
		platform: { env: { DB: {} } },
		locals: {}
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	mockProfile.mockResolvedValue({ did: 'did:plc:alice', handle: 'alice.test' } as never);
	mockAuthored.mockResolvedValue({ records: [event('at://a/1')] } as never);
	mockAttending.mockResolvedValue([] as never);
	mockOngoing.mockResolvedValue({
		events: [event('at://live/1')],
		handles: {},
		total: 1,
		totalIsFloor: false
	});
});

describe('profile page load', () => {
	it('returns the band when the band read succeeds', async () => {
		const data = (await load(request())) as unknown as LoadResult;

		expect(data.ongoingEvents).toHaveLength(1);
		expect(data.ongoingTotal).toBe(1);
	});

	// The regression this guards: `ongoingQuery` sat bare in the Promise.all, so a
	// thrown band read rejected the gather and the whole profile 500'd — while the
	// profile, upcoming, past and attending reads had all succeeded.
	it('renders the profile with an empty band when the band read throws', async () => {
		mockOngoing.mockRejectedValue(new Error('D1 unavailable'));

		const data = (await load(request())) as unknown as LoadResult;

		expect(data.ongoingEvents).toEqual([]);
		expect(data.ongoingTotal).toBe(0);
		expect(data.ongoingTotalIsFloor).toBe(false);
		// the rest of the page is intact, which is the whole point
		expect(data.actorProfile).toEqual({ did: 'did:plc:alice', handle: 'alice.test' });
		expect(data.actorDid).toBe('did:plc:alice');
		expect(data.upcomingEvents).toHaveLength(1);
	});

	// A band failure is optional; a profile read failure is not. Without this, a
	// blanket catch could be "fixed" in a way that also swallowed real errors.
	it('still fails when a read the profile cannot render without throws', async () => {
		mockProfile.mockRejectedValue(new Error('D1 unavailable'));

		await expect(load(request())).rejects.toThrow('D1 unavailable');
	});
});
