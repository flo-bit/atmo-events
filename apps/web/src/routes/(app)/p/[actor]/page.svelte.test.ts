import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const { user } = vi.hoisted(() => ({
	user: { isLoggedIn: true, did: 'did:plc:host' }
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user, logout: vi.fn() }));
vi.mock('#lib/components/CreateEventModal.svelte', () => ({
	createEventModalState: { show: vi.fn() }
}));
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
					actor: 'host.example.com',
					actorDid: 'did:plc:host',
					reportSubject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:host' },
					actorProfile: {
						did: 'did:plc:host',
						handle: 'host.example.com',
						value: { $type: 'app.bsky.actor.profile', displayName: 'Test Host' }
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
});

describe('profile actions', () => {
	it('shows create and logout actions on the signed-in viewer’s profile', () => {
		const html = markup();
		const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
		const create = buttons.filter(([, , text]) => text.includes('Create Event'));
		const logout = buttons.filter(([, , text]) => text.includes('Log out'));
		expect(create).toHaveLength(1);
		expect(logout).toHaveLength(1);
		expect(html).not.toContain('Report account');
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
