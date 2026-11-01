import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { RECENT_ACCOUNTS_STORAGE_KEY } from '@atmo-dev/kit';
import { CONNECTION_SCOPE } from '../meet/connection';
import { page as appPage } from '../meet/test-app';
import '../../app.css';

const mocks = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn() }));
vi.mock('../atproto/auth.svelte.js', () => ({ login: mocks.login, signup: mocks.signup }));
vi.mock('@atmo-dev/kit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@atmo-dev/kit')>()),
	createActorSearch: () => async () => []
}));
import LoginModal, { atProtoLoginModalState } from './LoginModal.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.removeItem(RECENT_ACCOUNTS_STORAGE_KEY);
	atProtoLoginModalState.hide();
});
afterEach(() => {
	atProtoLoginModalState.hide();
});

async function permissionsAt(path: string) {
	appPage.url = new URL(path, 'https://atmo.rsvp');
	await render(LoginModal);
	atProtoLoginModalState.show();
	await page.getByRole('combobox', { name: 'Your handle' }).fill('alice.test');
	await page.getByRole('button', { name: 'Log in', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Requested permissions' })).toBeVisible();
}

describe('contextual Meet login', () => {
	it('requests meetings during the first sign-in from a scanned link', async () => {
		await permissionsAt('/tools/meet?actor=bob.test');
		await expect.element(page.getByText('Meetings (required)', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Continue to log in', exact: true }).click();
		expect(mocks.login).toHaveBeenCalledExactlyOnceWith(
			'alice.test',
			expect.objectContaining({
				meetings: true,
				scopes: expect.arrayContaining([CONNECTION_SCOPE])
			})
		);
		expect(appPage.url.pathname + appPage.url.search).toBe('/tools/meet?actor=bob.test');
	});
	it('keeps meeting permission out of ordinary sign-in', async () => {
		await permissionsAt('/events');
		await expect
			.element(page.getByText('Meetings (required)', { exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Continue to log in', exact: true }).click();
		expect(mocks.login).toHaveBeenCalledExactlyOnceWith(
			'alice.test',
			expect.objectContaining({ meetings: false })
		);
		expect(mocks.login.mock.calls[0]![1].scopes).not.toContain(CONNECTION_SCOPE);
	});
	it('also includes meeting permission when signing up from a scanned link', async () => {
		appPage.url = new URL('https://atmo.rsvp/tools/meet?did=did:plc:bbbbbbbbbbbbbbbbbbbbbbbb');
		await render(LoginModal);
		atProtoLoginModalState.show();
		await page.getByRole('button', { name: 'Sign up', exact: true }).click();
		await page.getByRole('button', { name: 'Continue to sign up', exact: true }).click();
		expect(mocks.signup).toHaveBeenCalledExactlyOnceWith({ meetings: true });
	});
});
