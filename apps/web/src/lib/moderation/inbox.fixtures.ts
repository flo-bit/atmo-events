import type { InboxData, InboxProfile, InboxReport } from './inbox';

export const moderatorDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const hostDid = 'did:plc:cccccccccccccccccccccccc';
export const reporterProfile: InboxProfile = {
	did: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb',
	name: 'Mika Chen',
	handle: 'mika.example.com',
	href: '/p/did%3Aplc%3Abbbbbbbbbbbbbbbbbbbbbbbb',
	avatar:
		'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23a1a1aa"/%3E%3Ccircle cx="32" cy="25" r="12" fill="%23e4e4e7"/%3E%3Cellipse cx="32" cy="60" rx="23" ry="22" fill="%23e4e4e7"/%3E%3C/svg%3E'
};
export const eventReport: InboxReport = {
	id: 1,
	reportedBy: reporterProfile.did,
	reporter: reporterProfile,
	subject: {
		$type: 'com.atproto.repo.strongRef',
		uri: `at://${hostDid}/community.lexicon.calendar.event/meetup`,
		cid: 'bafytest'
	},
	subjectProfile: {
		did: hostDid,
		name: 'Alex Rivera',
		handle: 'alex.example.com',
		href: `/p/${encodeURIComponent(hostDid)}`
	},
	reasonType: 'com.atproto.moderation.defs#reasonViolation',
	reason:
		'The venue says this event is not taking place. The listing still asks people to buy tickets.',
	createdAt: '2026-10-31T00:56:46Z',
	status: 'open',
	preview: {
		hidden: false,
		labels: {},
		records: [
			{
				uri: `at://${hostDid}/community.lexicon.calendar.event/meetup`,
				value: { name: 'After-work atproto meetup', startsAt: '2026-11-05T18:00:00Z' }
			}
		]
	}
};
export const accountReport: InboxReport = {
	...eventReport,
	id: 2,
	subject: { $type: 'com.atproto.admin.defs#repoRef', did: hostDid },
	reasonType: 'com.atproto.moderation.defs#reasonSpam',
	reason: 'Repeated unsolicited event invitations with misleading links.',
	preview: { records: [], labels: {}, hidden: false }
};
export function inboxData(overrides: Partial<InboxData> = {}): InboxData {
	return {
		did: moderatorDid,
		status: 'open',
		canPublishActions: true,
		openCount: 12,
		reports: [eventReport, accountReport],
		...overrides
	};
}
