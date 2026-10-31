import { describe, expect, it } from 'vitest';
import { buildAttendee, buildEventAttendees } from '../contrail';

const did = 'did:plc:alice';

describe('RSVP attendee profile links', () => {
	it.each(['alice.test', 'alice.blacksky.team'])(
		'links %s to an atmo.rsvp profile, not an external client',
		(handle) => {
			const attendee = buildAttendee(did, 'going', [{ did, handle }]);
			expect(attendee.url).toBe(`/p/${handle}`);
		}
	);

	it('falls back to the DID when no handle has been hydrated', () => {
		expect(buildAttendee(did, 'interested').url).toBe(`/p/${encodeURIComponent(did)}`);
	});

	it('uses local profiles for both going and interested groups', () => {
		const record = (actor: `did:${string}:${string}`) =>
			({
				did: actor,
				collection: 'community.lexicon.calendar.rsvp',
				rkey: 'test',
				time_us: 0,
				uri: `at://${actor}/community.lexicon.calendar.rsvp/test`,
				value: {
					$type: 'community.lexicon.calendar.rsvp',
					createdAt: '2026-10-31T00:00:00Z',
					subject: { uri: 'at://did:plc:host/community.lexicon.calendar.event/test', cid: 'cid' }
				}
			}) as const;
		const attendees = buildEventAttendees({
			going: [record(did)],
			interested: [record('did:plc:bob')]
		});
		expect(attendees.going[0].url).toBe(`/p/${encodeURIComponent(did)}`);
		expect(attendees.interested[0].url).toBe(`/p/${encodeURIComponent('did:plc:bob')}`);
	});
});
