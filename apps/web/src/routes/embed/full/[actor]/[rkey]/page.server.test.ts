import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRecord: vi.fn(), flatten: vi.fn() }));
vi.mock('#lib/actor.js', () => ({ getActor: async () => 'did:plc:host' }));
vi.mock('#lib/contrail/index.js', () => ({ getServerClient: () => ({}) }));
vi.mock('#lib/contrail.js', () => ({
	getEventRecordFromContrail: mocks.getRecord,
	flattenEventRecord: mocks.flatten,
	getHostProfile: () => null,
	getProfileBlobUrl: vi.fn(),
	getProfileFromContrail: vi.fn(),
	getRsvpStatus: () => null,
	getViewerRsvpFromContrail: vi.fn(),
	listEventAttendeesFromContrail: async () => ({
		going: [],
		interested: [],
		goingCount: 0,
		interestedCount: 0
	}),
	RSVP_HYDRATE_LIMIT: 50
}));

import { load } from './+page.server';

const request = {
	params: { actor: 'host.test', rkey: 'event' },
	url: new URL('https://atmo.rsvp/embed/full/host.test/event')
} as Parameters<typeof load>[0];

afterEach(() => vi.clearAllMocks());

describe('full embed descriptions', () => {
	it.each(['## Plan\n\nBring **snacks**', '  '])(
		'supplies a serializable parsed description for %j',
		async (description) => {
			const uri = 'at://did:plc:host/community.lexicon.calendar.event/event';
			mocks.getRecord.mockResolvedValue({ uri });
			mocks.flatten.mockReturnValue({
				uri,
				name: 'Meetup',
				startsAt: '2026-11-10T18:00:00Z',
				description
			});
			const data = await load(request);
			expect(data.eventData.description).toBe(description);
			if (description.trim()) {
				expect(data.description?.markdown).toBe(true);
				expect(data.description?.children[0]).toMatchObject({ type: 'heading', depth: 2 });
				expect(JSON.parse(JSON.stringify(data.description))).toEqual(data.description);
			} else {
				expect(data.description).toBeNull();
			}
		}
	);
});
