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
