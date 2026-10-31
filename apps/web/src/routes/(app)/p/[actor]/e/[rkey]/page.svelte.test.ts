import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { PreferredSocialClient } from '@atmo-dev/kit/social';

const { user } = vi.hoisted(() => ({
	user: {
		isLoggedIn: true,
		did: 'did:plc:viewer',
		canPostToBluesky: false,
		profile: null,
		preferredSocialClient: null as PreferredSocialClient | null
	}
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user }));
vi.mock('#lib/components/editor/adapter.js', () => ({ createInAppAdapter: () => ({}) }));
vi.mock('#lib/moderation/reports.remote', () => ({ submitReport: vi.fn() }));
vi.mock('#lib/starter-packs/packs.remote.js', () => ({ openStarterPack: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://atmo.rsvp/p/host/e/event') } }));

import EventPage from './+page.svelte';
import AppFooter from '#lib/components/AppFooter.svelte';

function markup(
	cid: string | undefined = 'bafytest',
	packs = { enabled: false, going: 0, interested: 0 },
	showComments = false
) {
	return (
		render(EventPage, {
			props: {
				data: {
					canPostToBluesky: false,
					isModerator: false,
					did: null,
					profile: null,
					preferredSocialClient: null,
					preferredClientLoadFailed: false,
					pageTitle: 'Meetup',
					pageDescription: 'A meetup',
					ogImage: 'https://atmo.rsvp/og.png',
					starterPacksEnabled: packs.enabled,
					eventData: {
						name: 'Meetup',
						startsAt: '2099-10-24T18:00:00Z',
						createdAt: '2026-10-01T12:00:00Z',
						did: 'did:plc:host',
						rkey: 'event',
						uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
						...(showComments
							? {
									bskyPostRef: {
										uri: 'at://did:plc:host/app.bsky.feed.post/root',
										cid: 'post-cid',
										showComments: true
									}
								}
							: {}),
						cid
					},
					actorDid: 'did:plc:host',
					reportSubject: cid
						? {
								$type: 'com.atproto.repo.strongRef',
								uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
								cid
							}
						: undefined,
					rkey: 'event',
					hostProfile: null,
					attendees: {
						going: [],
						interested: [],
						goingCount: packs.going,
						interestedCount: packs.interested
					},
					viewerRsvpStatus: null,
					viewerRsvpRkey: null,
					parentEvent: null,
					parentEventActor: null,
					parentScheduleUrl: null,
					vod: null,
					isConference: false,
					conferenceTalks: [],
					conferenceTimezone: 'UTC',
					conferenceRsvpStatuses: {},
					conferenceRsvpRkeys: {},
					conferenceVods: {},
					loggedIn: user.isLoggedIn,
					speakerProfiles: []
				}
			}
		}).body +
		render(AppFooter, {
			props: {
				subject: cid
					? {
							$type: 'com.atproto.repo.strongRef',
							uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
							cid
						}
					: undefined
			}
		}).body
	);
}

afterEach(() => {
	user.isLoggedIn = true;
	user.did = 'did:plc:viewer';
	user.preferredSocialClient = null;
});

describe('event comment client', () => {
	it('forwards the signed-in viewer’s preferred client to the comments', () => {
		user.preferredSocialClient = { client: 'blacksky' };
		const html = markup('bafytest', undefined, true);
		expect(html).toContain('Add a comment on Blacksky');
		expect(html).toContain('href="https://blacksky.community/profile/did:plc:host/post/root"');
	});
});

describe('event starter pack visibility', () => {
	it('passes the viewer’s preferred client to the starter pack button', () => {
		user.preferredSocialClient = { client: 'blacksky' };
		const html = markup('bafytest', { enabled: true, going: 4, interested: 2 });
		expect(html).toContain('Follow attendees on Blacksky.');
		expect(html).not.toContain('Follow attendees on Bluesky.');
	});
	it.each([
		[true, 3, 2, false],
		[true, 3, 3, true],
		[true, 6, 0, true],
		[true, 0, 6, true],
		[false, 6, 6, false]
	] as const)(
		'enabled=%s, going=%s, interested=%s: visible=%s',
		(enabled, going, interested, visible) => {
			const html = markup('bafytest', { enabled, going, interested });
			expect(html.includes('Starter pack ↗')).toBe(visible);
			expect(html.includes('Follow attendees on Bluesky.')).toBe(visible);
		}
	);
});

describe('event reporting', () => {
	it('offers reporting in the footer after another host’s event', () => {
		const html = markup();
		expect(html).toMatch(/<footer\b[^>]*>[\s\S]*Report event[\s\S]*<\/footer>/);
		expect(html.slice(0, html.indexOf('<footer'))).toContain('Add to Calendar');
	});

	it('does not offer reporting on your own event', () => {
		user.did = 'did:plc:host';
		expect(markup()).not.toContain('Report event');
	});

	it('keeps reporting available while signed out, even with a stale viewer DID', () => {
		user.isLoggedIn = false;
		user.did = 'did:plc:host';
		expect(markup()).toMatch(/<footer\b[^>]*>[\s\S]*Report event[\s\S]*<\/footer>/);
	});

	it('requires a CID for a strong-reference report', () => {
		expect(markup('')).not.toContain('Report event');
	});
});
