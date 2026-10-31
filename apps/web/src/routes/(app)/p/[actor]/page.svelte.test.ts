import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { PreferredSocialClient } from '@atmo-dev/kit/social';

const { user } = vi.hoisted(() => ({
	user: {
		isLoggedIn: true,
		did: 'did:plc:host',
		preferredSocialClient: null as PreferredSocialClient | null
	}
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user, logout: vi.fn() }));
vi.mock('#lib/contrail.js', () => ({ getProfileBlobUrl: vi.fn() }));
vi.mock('#lib/moderation/reports.remote', () => ({ submitReport: vi.fn() }));

import ProfilePage from './+page.svelte';
import AppFooter from '#lib/components/AppFooter.svelte';

function markup() {
	return (
		render(ProfilePage, {
			props: {
				data: {
					pageTitle: 'Test Host - Events',
					pageDescription: 'Events hosted by Test Host',
					canPostToBluesky: false,
					isModerator: false,
					did: null,
					profile: null,
					preferredSocialClient: null,
					preferredClientLoadFailed: false,
					actor: 'host.example.com',
					actorDid: 'did:plc:host',
					eventCounts: { created: 130, rsvpd: 42 },
					blueskyProfile: {
						did: 'did:plc:host',
						pronouns: 'they/them',
						followersCount: 999,
						followsCount: 500,
						postsCount: 10000,
						links: [{ url: 'https://work.test', title: '<b>Work</b>' }]
					},
					reportSubject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:host' },
					actorProfile: {
						did: 'did:plc:host',
						handle: 'host.example.com',
						value: {
							$type: 'app.bsky.actor.profile',
							displayName: 'Test Host',
							description:
								'Hello <img src=x onerror=alert(1)>\n@alice.test #events https://example.com'
						}
					},
					ongoingEvents: [],
					ongoingTotal: 0,
					ongoingTotalIsFloor: false,
					upcomingEvents: [],
					attendingEvents: [],
					pastEvents: [],
					hasMoreUpcoming: false,
					hasMorePast: false
				}
			}
		}).body +
		render(AppFooter, {
			props: { subject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:host' } }
		}).body
	);
}

afterEach(() => {
	user.isLoggedIn = true;
	user.did = 'did:plc:host';
	user.preferredSocialClient = null;
});

describe('profile actions', () => {
	it('routes bio mentions locally and hashtags to the viewer’s client', () => {
		user.preferredSocialClient = { client: 'blacksky' };
		const html = markup();
		expect(html).toContain('href="/p/alice.test"');
		expect(html).toContain('href="https://blacksky.community/hashtag/events"');
		expect(html).not.toContain('https://bsky.app/hashtag/');
	});
	it('renders the complete read-only header with safe bio, pronouns, modern links and a Bluesky link', () => {
		const html = markup();
		expect(html).toContain('they/them');
		expect(html).toContain('href="https://bsky.app/profile/did:plc:host"');
		expect(html).toContain('View on Bluesky');
		expect(html).toContain('href="https://work.test/"');
		expect(html).toContain('&lt;b>Work&lt;/b>');
		expect(html).toContain('Hello &lt;img src=x onerror=alert(1)>');
		expect(html).not.toContain('<img src=x');
		expect(html).toContain('href="/p/alice.test"');
		expect(html).not.toContain('Edit profile');
		expect(html).toContain('events created');
		expect(html).toContain('events RSVP’d');
		expect(html).toContain('130');
		expect(html).toContain('42');
		expect(html).not.toMatch(/followers|following|10,000/);
	});
	it('keeps account controls out of the signed-in viewer’s profile header', () => {
		const html = markup();
		expect(html).not.toContain('Create Event');
		expect(html).not.toContain('Settings');
		expect(html).not.toContain('Log out');
		expect(html).not.toContain('Report account');
		expect(html).toContain('View on Bluesky');
		expect(html).toContain('@host.example.com');
	});

	it('offers reporting on another account’s profile', () => {
		user.did = 'did:plc:viewer';
		const html = markup();
		expect(html).toMatch(/<footer\b[^>]*>[\s\S]*Report account[\s\S]*<\/footer>/);
		expect(html.slice(0, html.indexOf('<footer'))).toContain('This person hasn');
		expect(html).not.toContain('Create Event');
		expect(html).not.toContain('Log out');
	});

	it('keeps reporting available but hides owner actions when signed out', () => {
		user.isLoggedIn = false;
		const html = markup();
		expect(html).toMatch(/<footer\b[^>]*>[\s\S]*Report account[\s\S]*<\/footer>/);
		expect(html).not.toContain('Create Event');
		expect(html).not.toContain('Log out');
		expect(html).toContain('Test Host');
	});
});
