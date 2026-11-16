import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/contrail/index.js', () => ({
	getServerClient: vi.fn(() => ({ get: vi.fn(async () => ({ ok: false })) }))
}));
vi.mock('#lib/contrail.js', () => ({
	listDiscoverableEventsFromContrail: vi.fn(),
	listEventRecordsFromContrail: vi.fn(),
	getHostProfile: vi.fn(),
	buildAttendee: vi.fn(),
	flattenEventRecord: vi.fn((r: unknown) => r),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	withD1Retry: vi.fn((fn: () => unknown) => fn())
}));
// Keep a spy to guard against reintroducing the unused homepage query.
vi.mock('#lib/contrail/ongoing.js', () => ({ ongoingQuery: vi.fn() }));
vi.mock('#lib/server/edge-cache.js', () => ({
	cachedRead: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn())
}));
vi.mock('#lib/dedupe-by-uri.js', () => ({ dedupeByUri: vi.fn((e: unknown[]) => e) }));
// Private events: off unless a test turns them on.
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: vi.fn(() => false)
}));
vi.mock('#lib/private-events/server/beta.js', () => ({
	privateEventsBeta: vi.fn(async () => false)
}));
vi.mock('#lib/private-events/server/caller.js', () => ({ callerSession: vi.fn(async () => null) }));
vi.mock('#lib/private-events/server/events.js', () => ({ myPrivateEvents: vi.fn() }));

import { waitUntil } from 'cloudflare:workers';
import { load } from './+page.server';
import { GUEST_SCOPE } from '#lib/private-events/scopes.js';
import { privateEventsBeta } from '#lib/private-events/server/beta.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';
import { myPrivateEvents } from '#lib/private-events/server/events.js';
import { listDiscoverableEventsFromContrail } from '#lib/contrail.js';
import { ongoingQuery } from '#lib/contrail/ongoing.js';
import { cachedRead } from '#lib/server/edge-cache.js';

const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	recentActivity: unknown[];
	myUpcoming: { name: string }[];
	myPast: unknown[];
	privateLinks: Record<string, { href: string }>;
	privateEventsIncomplete: boolean;
};

const event = {
	uri: 'at://a/1',
	did: 'did:plc:alice',
	rkey: '1',
	name: 'an event',
	startsAt: '2026-07-01T00:00:00Z',
	createdAt: '2026-06-01T00:00:00Z'
};
const request = () => ({ locals: {} }) as unknown as Parameters<typeof load>[0];

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

describe('your own private events in Your events', () => {
	const ME = 'did:plc:mememememememememememememe';
	const dinner = {
		uri: 'at://did:plc:host/space/community.lexicon.calendar.collection/3ldinner/did:plc:host/community.lexicon.calendar.event/3ldinner',
		did: 'did:plc:host',
		rkey: '3ldinner',
		name: 'Dinner',
		startsAt: new Date(Date.now() + 86400000).toISOString(),
		createdAt: '2026-11-01T00:00:00Z'
	};
	const signedIn = () => {
		const setHeaders = vi.fn();
		const event = { locals: { did: ME, session: {} }, setHeaders };
		return { event: event as unknown as Parameters<typeof load>[0], setHeaders };
	};
	const turnOn = () => {
		vi.mocked(privateEventsEnabled).mockReturnValue(true);
		vi.mocked(privateEventsBeta).mockResolvedValue(true);
		vi.mocked(callerSession).mockResolvedValue({ did: ME, scope: GUEST_SCOPE } as never);
		vi.mocked(myPrivateEvents).mockResolvedValue({
			events: [
				{
					event: dinner,
					href: '/p/host.example.com/private/3ldinner'
				}
			],
			incomplete: false
		} as never);
	};

	it('lists them with the public ones, linked to their own pages, and keeps the page from any cache', async () => {
		turnOn();
		const { event, setHeaders } = signedIn();
		const data = (await load(event)) as unknown as LoadResult;
		expect(data.myUpcoming.map((e) => e.name)).toEqual(['Dinner']);
		expect(data.privateLinks).toEqual({
			[dinner.uri]: { href: '/p/host.example.com/private/3ldinner' }
		});
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});

	it('reads none with the beta off, and changes nothing', async () => {
		turnOn();
		vi.mocked(privateEventsBeta).mockResolvedValue(false);
		const { event, setHeaders } = signedIn();
		const data = (await load(event)) as unknown as LoadResult;
		expect(myPrivateEvents).not.toHaveBeenCalled();
		expect(data.myUpcoming).toEqual([]);
		expect(data.privateLinks).toEqual({});
		expect(setHeaders).not.toHaveBeenCalled();
	});

	it('reads none with private events off, without even asking about the beta', async () => {
		turnOn();
		vi.mocked(privateEventsEnabled).mockReturnValue(false);
		const { event } = signedIn();
		await load(event);
		expect(privateEventsBeta).not.toHaveBeenCalled();
		expect(myPrivateEvents).not.toHaveBeenCalled();
	});

	it('reads none without a grant to read them, and asks their server nothing', async () => {
		turnOn();
		vi.mocked(callerSession).mockResolvedValue({ did: ME, scope: 'atproto' } as never);
		const { event } = signedIn();
		const data = (await load(event)) as unknown as LoadResult;
		expect(privateEventsBeta).not.toHaveBeenCalled();
		expect(myPrivateEvents).not.toHaveBeenCalled();
		expect(data.privateEventsIncomplete).toBe(false);
	});

	it('asks their server nothing when the session can’t be read', async () => {
		turnOn();
		vi.mocked(callerSession).mockResolvedValue(null);
		const { event } = signedIn();
		await load(event);
		expect(privateEventsBeta).not.toHaveBeenCalled();
	});

	it('says nothing is missing with the beta off', async () => {
		turnOn();
		vi.mocked(privateEventsBeta).mockResolvedValue(false);
		const { event } = signedIn();
		const data = (await load(event)) as unknown as LoadResult;
		expect(data.privateEventsIncomplete).toBe(false);
	});

	it('says some may be missing when some could not be read', async () => {
		turnOn();
		vi.mocked(myPrivateEvents).mockResolvedValue({ events: [], incomplete: true } as never);
		const { event, setHeaders } = signedIn();
		const data = (await load(event)) as unknown as LoadResult;
		expect(data.privateEventsIncomplete).toBe(true);
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});

	it('shows the public ones alone when theirs could not be read, and logs not whose', async () => {
		turnOn();
		vi.mocked(myPrivateEvents).mockRejectedValue(new Error(`503 for ${ME}`));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { event, setHeaders } = signedIn();
		const data = (await load(event)) as unknown as LoadResult;
		expect(data.myUpcoming).toEqual([]);
		expect(data.privateLinks).toEqual({});
		expect(data.privateEventsIncomplete).toBe(true);
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
		expect(String(vi.mocked(console.error).mock.calls)).not.toContain(ME);
	});

	it('keeps reading after it stops waiting, until the read is done', async () => {
		turnOn();
		let finish = () => {};
		vi.mocked(myPrivateEvents).mockReturnValue(
			new Promise((resolve) => (finish = () => resolve({ events: [] } as never)))
		);
		const loading = load(signedIn().event);
		expect(waitUntil).toHaveBeenCalledOnce();
		let done = false;
		void vi.mocked(waitUntil).mock.calls[0][0].then(() => (done = true));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(done).toBe(false);
		finish();
		await loading;
		expect(done).toBe(true);
	});

	it('does not wait more than a few seconds for their server', async () => {
		vi.useFakeTimers();
		try {
			turnOn();
			vi.mocked(myPrivateEvents).mockReturnValue(new Promise(() => {}));
			const { event } = signedIn();
			const loading = load(event);
			await vi.advanceTimersByTimeAsync(4000);
			const data = (await loading) as unknown as LoadResult;
			expect(data.myUpcoming).toEqual([]);
			expect(data.privateLinks).toEqual({});
			expect(data.privateEventsIncomplete).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
