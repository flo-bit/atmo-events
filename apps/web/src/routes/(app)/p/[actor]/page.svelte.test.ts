import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const { user } = vi.hoisted(() => ({
	user: { isLoggedIn: true, did: 'did:plc:host' }
}));
vi.mock('$lib/atproto/auth.svelte', () => ({ user, logout: vi.fn() }));
vi.mock('$lib/components/CreateEventModal.svelte', () => ({
	createEventModalState: { show: vi.fn() }
}));
vi.mock('$lib/contrail', () => ({ getProfileBlobUrl: vi.fn() }));

import ProfilePage from './+page.svelte';

function markup() {
	return render(ProfilePage, {
		props: {
			data: {
				pageTitle: 'Test Host - Events',
				did: null,
				profile: null,
				actor: 'host.example.com',
				actorDid: 'did:plc:host',
				actorProfile: {
					did: 'did:plc:host',
					handle: 'host.example.com',
					value: { displayName: 'Test Host' }
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
	}).body;
}

afterEach(() => {
	user.isLoggedIn = true;
});

describe('profile actions', () => {
	it('groups one primary create action and a quiet logout alongside the identity', () => {
		const html = markup();
		const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
		const create = buttons.filter(([, , text]) => text.includes('Create Event'));
		const logout = buttons.filter(([, , text]) => text.includes('Log out'));
		expect(create).toHaveLength(1);
		expect(logout).toHaveLength(1);
		expect(create[0][1]).toContain('data-variant="primary"');
		expect(logout[0][1]).toContain('data-variant="ghost"');
		expect(html).toContain('@host.example.com');
		expect(html).not.toContain('-mt-6');
	});

	it('does not show account actions on someone else’s public profile', () => {
		user.isLoggedIn = false;
		const html = markup();
		expect(html).not.toContain('Create Event');
		expect(html).not.toContain('Log out');
		expect(html).toContain('Test Host');
	});
});
