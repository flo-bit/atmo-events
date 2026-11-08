import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getRecord: vi.fn(), match: vi.fn() }));
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({}) }));
vi.mock('#lib/contrail.js', () => ({
	getEventRecordFromContrail: mocks.getRecord,
	withD1Retry: (read: () => Promise<unknown>) => read(),
	RSVP_HYDRATE_LIMIT: 50,
	flattenEventRecord: vi.fn(),
	flattenEventRecords: vi.fn(),
	getHostProfile: vi.fn(),
	getProfileBlobUrl: vi.fn(),
	getProfileFromContrail: vi.fn(),
	getRsvpStatus: vi.fn(),
	getViewerRsvpFromContrail: vi.fn(),
	listConferenceTalksFromContrail: vi.fn(),
	listEventAttendeesFromContrail: vi.fn()
}));
import { load } from './+page.server';
import { flattenEventRecord, listEventAttendeesFromContrail } from '#lib/contrail.js';
const event = {
	params: { actor: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', rkey: 'event' },
	locals: { did: null },
	url: new URL('https://atmo.rsvp/p/test/e/event')
} as Parameters<typeof load>[0];
afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});
describe('event visibility fails closed', () => {
	it('uses the resolved record URI, not the route handle or viewer, for AT metadata', async () => {
		const uri = 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/community.lexicon.calendar.event/event';
		mocks.getRecord.mockResolvedValueOnce({ uri });
		vi.mocked(flattenEventRecord).mockReturnValueOnce({
			uri,
			did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
			name: 'Meetup',
			startsAt: '2026-11-03T12:00:00Z'
		} as never);
		vi.mocked(listEventAttendeesFromContrail).mockRejectedValueOnce(new Error('Unavailable'));
		const data = await load({ ...event, params: { actor: 'host.test', rkey: 'event' } });
		expect(data.atTags).toEqual({
			canonical: [uri],
			author: ['at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'],
			alternate: []
		});
	});

	it('parses the description on the server and uses plain text for the meta description', async () => {
		const uri = 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/community.lexicon.calendar.event/event';
		mocks.getRecord.mockResolvedValueOnce({ uri });
		vi.mocked(flattenEventRecord).mockReturnValueOnce({
			uri,
			did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
			name: 'Meetup',
			startsAt: '2026-11-03T12:00:00Z',
			description: '# Plan\n\nBring **snacks** <b>now</b>'
		} as never);
		vi.mocked(listEventAttendeesFromContrail).mockRejectedValueOnce(new Error('Unavailable'));
		const data = await load(event);
		expect(data.description?.markdown).toBe(true);
		expect(data.description?.children[0]).toMatchObject({ type: 'heading', depth: 1 });
		expect(data.pageDescription).toBe('Plan\n\nBring snacks <b>now</b>');
		expect(data.conferenceTalkDescriptions).toEqual({});
	});

	it('falls back to the event name without a description', async () => {
		const uri = 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/community.lexicon.calendar.event/event';
		mocks.getRecord.mockResolvedValueOnce({ uri });
		vi.mocked(flattenEventRecord).mockReturnValueOnce({
			uri,
			did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
			name: 'Meetup',
			startsAt: '2026-11-03T12:00:00Z',
			description: '  '
		} as never);
		vi.mocked(listEventAttendeesFromContrail).mockRejectedValueOnce(new Error('Unavailable'));
		const data = await load(event);
		expect(data.description).toBeNull();
		expect(data.pageDescription).toBe('Event: Meetup');
	});

	it('does not resurrect a hidden/missing event from the legacy cache', async () => {
		vi.stubGlobal('caches', { default: { match: mocks.match } });
		mocks.match.mockResolvedValue(Response.json({ value: { name: 'Old hidden event' } }));
		mocks.getRecord.mockResolvedValue(null);
		await expect(load(event)).rejects.toMatchObject({ status: 404 });
		expect(mocks.match).not.toHaveBeenCalled();
	});
	it('returns unavailable rather than stale event content during a database outage', async () => {
		vi.stubGlobal('caches', { default: { match: mocks.match } });
		mocks.getRecord.mockRejectedValue(new Error('D1 unavailable'));
		await expect(load(event)).rejects.toMatchObject({ status: 503 });
		expect(mocks.match).not.toHaveBeenCalled();
	});
});
