import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import '../../app.css';

const mocks = vi.hoisted(() => ({
	user: {
		isLoggedIn: true,
		did: 'did:plc:alice',
		profile: null as { displayName: string; handle: string; avatar?: string } | null
	},
	logout: vi.fn(async () => {}),
	login: vi.fn(),
	signup: vi.fn()
}));
vi.mock('#lib/atproto/auth.svelte.js', () => mocks);
// Browser-test Kit aliases share one module, so preserve its other exports.
vi.mock('$app/state', async (importOriginal) => ({
	...(await importOriginal()),
	page: { url: new URL('https://atmo.rsvp/events'), data: {} },
	afterNavigate: vi.fn()
}));
// The legal footer's remote reporting transport is unrelated to navigation.
vi.mock('#lib/components/AppFooter.svelte', () => ({ default: () => {} }));

import Layout from './+layout.svelte';
import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Events</p>' }));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.user.isLoggedIn = true;
	mocks.user.profile = { displayName: 'Alice', handle: 'alice.test', avatar: undefined };
	document.body.classList.add('atmo', 'zinc', 'pink');
	atProtoLoginModalState.hide();
});
afterEach(async () => {
	atProtoLoginModalState.hide();
	document.body.classList.remove('atmo', 'zinc', 'pink');
	await page.viewport(1280, 1000);
});

describe('sidebar account menu', () => {
	it('keeps Settings separate and signs out through the existing auth helper', async () => {
		await render(Layout, { children });
		await expect
			.element(page.getByRole('link', { name: 'Settings', exact: true }))
			.toHaveAttribute('href', '/settings');
		const trigger = page.getByRole('button', { name: 'Account menu', exact: true });
		await trigger.click();
		await expect
			.element(page.getByRole('menuitem', { name: 'Go to profile' }))
			.toHaveAttribute('href', '/p/alice.test');
		expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
		await page.getByRole('menuitem', { name: 'Sign out' }).click();
		expect(mocks.logout).toHaveBeenCalledExactlyOnceWith();
		await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
		await expect.element(trigger).toHaveFocus();
	});

	it('falls back to the DID when the profile is not loaded', async () => {
		mocks.user.profile = null;
		await render(Layout, { children });
		await page.getByRole('button', { name: 'Account menu', exact: true }).click();
		await expect
			.element(page.getByRole('menuitem', { name: 'Go to profile' }))
			.toHaveAttribute('href', '/p/did%3Aplc%3Aalice');
	});

	it('closes the mobile drawer on profile selection and sign-out', async () => {
		await page.viewport(390, 844);
		await render(Layout, { children });
		const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
		await navigation.click();
		await expect.element(page.getByText('@alice.test', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Account menu', exact: true }).click();
		const profile = page.getByRole('menuitem', { name: 'Go to profile' });
		profile.element().addEventListener('click', (event) => event.preventDefault(), { once: true });
		await profile.click();
		await expect
			.element(page.getByRole('dialog', { name: 'Event navigation' }))
			.not.toBeInTheDocument();
		await navigation.click();
		await page.getByRole('button', { name: 'Account menu', exact: true }).click();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('dialog', { name: 'Event navigation' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Account menu', exact: true }))
			.toHaveFocus();
		await page.getByRole('button', { name: 'Account menu', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Sign out' }).click();
		expect(mocks.logout).toHaveBeenCalledExactlyOnceWith();
		await expect
			.element(page.getByRole('dialog', { name: 'Event navigation' }))
			.not.toBeInTheDocument();
	});

	it('preserves the signed-out login button', async () => {
		mocks.user.isLoggedIn = false;
		await render(Layout, { children });
		await expect
			.element(page.getByRole('button', { name: 'Account menu', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Log in', exact: true }).click();
		expect(atProtoLoginModalState.open).toBe(true);
	});
});
