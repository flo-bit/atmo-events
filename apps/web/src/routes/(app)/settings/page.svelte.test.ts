import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const { user } = vi.hoisted(() => ({ user: { isLoggedIn: true, did: 'did:plc:alice' } }));
vi.mock('#lib/atproto/auth.svelte.js', () => ({
	user,
	authorizePreferredSocialClient: vi.fn(),
	logout: vi.fn()
}));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));
import SettingsPage from './+page.svelte';
import type { PageData } from './$types';

function markup(overrides: Partial<PageData> = {}) {
	return render(SettingsPage, {
		props: {
			data: {
				did: 'did:plc:alice',
				profile: null,
				canPostToBluesky: false,
				isModerator: false,
				preferredSocialClient: { client: 'custom', customUrl: 'https://client.example/app' },
				preferredClientLoadFailed: false,
				canSaveClient: true,
				pageTitle: 'Settings · atmo.rsvp',
				pageDescription: 'Choose your preferred social app.',
				...overrides
			},
			form: null,
			params: {}
		}
	}).body;
}

beforeEach(() => {
	user.isLoggedIn = true;
});

describe('settings page', () => {
	it.each([{}, { canSaveClient: false }, { preferredClientLoadFailed: true }])(
		'offers sign-out in every signed-in state: %j',
		(state) => {
			expect(markup(state)).toContain('Sign out');
		}
	);
	it('renders the saved custom selection on the server, with public-storage disclosure', () => {
		const html = markup();
		expect(html).toContain('value="custom" selected');
		expect(html).toContain('value="https://client.example/app"');
		expect(html).toContain('Your selection is public');
		expect(html).toContain('method="POST"');
	});
	it('offers sign-in instead of a form when signed out', () => {
		user.isLoggedIn = false;
		const html = markup({ did: null });
		expect(html).toContain('Log in to choose');
		expect(html).not.toContain('Sign out');
		expect(html).not.toContain('<form');
	});
	it('offers incremental authorization instead of showing the picker without permission', () => {
		const html = markup({ canSaveClient: false });
		expect(html).toContain('We need additional permission');
		expect(html).toContain('Authorize now');
		expect(html).not.toContain('<select');
		expect(html).not.toContain('<form');
	});
	it('still offers authorization if the record could not be loaded', () => {
		const html = markup({ canSaveClient: false, preferredClientLoadFailed: true });
		expect(html).toContain('Authorize now');
		expect(html).not.toContain('Try again');
	});
	it('does not offer to overwrite a selection that failed to load', () => {
		const html = markup({ preferredClientLoadFailed: true });
		expect(html).toContain('Try again');
		expect(html).not.toContain('<form');
	});
});
