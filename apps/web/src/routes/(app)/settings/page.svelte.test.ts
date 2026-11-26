import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import SettingsPage from './+page.svelte';

vi.mock('#lib/atproto/auth.svelte.js', () => ({ user: { isLoggedIn: false, did: null } }));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));
import NotificationSettingsPage from './notifications/+page.svelte';

const viewer = {
	did: 'did:plc:test' as const,
	profile: null,
	canPostToBluesky: false,
	isModerator: false
};

it('links to separate settings pages without rendering their forms', () => {
	const html = render(SettingsPage, {
		props: {
			data: {
				...viewer,
				privateEventsEnabled: false,
				pageTitle: 'Settings'
			},
			params: {}
		}
	}).body;
	expect(html).toContain('href="/settings/social"');
	expect(html).toContain('href="/settings/notifications"');
	expect(html).toContain('aria-label="Settings"');
	expect(html).not.toContain('<form');
	expect(html).not.toContain('<table');
});

it('preserves the upstream private-events setting as a feature-gated settings page', () => {
	for (const enabled of [false, true]) {
		const html = render(SettingsPage, {
			props: {
				data: {
					...viewer,
					privateEventsEnabled: enabled,
					pageTitle: 'Settings'
				},
				params: {}
			}
		}).body;
		expect(html.includes('href="/settings/private-events"')).toBe(enabled);
	}
});

it('shows a login action instead of the hub links when signed out', () => {
	const html = render(SettingsPage, {
		props: {
			params: {},
			data: {
				did: null,
				profile: null,
				canPostToBluesky: false,
				isModerator: false,
				pageTitle: 'Settings',
				privateEventsEnabled: true
			}
		}
	}).body;
	expect(html).toContain('Log in');
	expect(html).not.toContain('/settings/notifications');
});

it('offers sign-in on the notifications settings page without loading private preferences', () => {
	const html = render(NotificationSettingsPage).body;
	expect(html).toContain('Log in to manage your notifications.');
	expect(html).not.toContain('Preferred social app');
	expect(html).not.toContain('<table');
});
