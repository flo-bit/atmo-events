import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';

const mocks = vi.hoisted(() => ({
	beta: { ready: true, current: { canSave: true, on: false }, refresh: vi.fn(async () => {}) },
	updates: vi.fn(async () => ({ on: true })),
	set: vi.fn(),
	requestPermissions: vi.fn(async () => {})
}));
// The switch is a SvelteKit remote query and command, which a browser test has no server for.
vi.mock('../private-events.remote', () => ({
	getPrivateEventsBeta: () => mocks.beta,
	setPrivateEventsBeta: mocks.set
}));
vi.mock('@svelte-atproto/oauth/client', () => ({ requestPermissions: mocks.requestPermissions }));

import FindAgainOffer from './FindAgainOffer.svelte';
import { BETA_SCOPE } from '../beta';

const PENDING = 'atmo:turn-on-private-events';

/** The text a person reads, with the template's line breaks and indents collapsed. */
function shownText(): string {
	const found = page.getByTestId('find-again').elements()[0];
	return (found?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
	mocks.beta.ready = true;
	mocks.beta.current = { canSave: true, on: false };
	mocks.set.mockReturnValue({ updates: mocks.updates });
	sessionStorage.removeItem(PENDING);
});
afterEach(() => vi.clearAllMocks());

describe('the offer to find a private event again', () => {
	it('offers a guest without the beta to turn it on, and says the choice can be seen', async () => {
		render(FindAgainOffer);
		await expect
			.poll(shownText)
			.toContain('Turn on private events to find this again in Your events, on the home page.');
		expect(shownText()).toContain('saved in your account, where anyone can see it');
	});

	it('turns it on in one click, then says where to find the event', async () => {
		render(FindAgainOffer);
		await page.getByRole('button', { name: 'Turn on private events' }).click();
		await expect
			.poll(shownText)
			.toContain('Private events are on. Find this again in Your events, on the home page.');
		expect(mocks.set).toHaveBeenCalledWith({ on: true });
		await expect
			.element(page.getByRole('link', { name: 'Your events' }))
			.toHaveAttribute('href', '/');
	});

	it('asks for the permission to save it first, and keeps the click across the trip', async () => {
		mocks.beta.current = { canSave: false, on: false };
		render(FindAgainOffer);
		await page.getByRole('button', { name: 'Turn on private events' }).click();
		await expect.poll(() => mocks.requestPermissions).toHaveBeenCalled();
		expect(mocks.requestPermissions).toHaveBeenCalledWith(
			BETA_SCOPE,
			expect.objectContaining({ saveReturnTo: true })
		);
		expect(sessionStorage.getItem(PENDING)).toBe('1');
		expect(mocks.set).not.toHaveBeenCalled();
	});

	it('finishes turning it on when back from granting the permission', async () => {
		sessionStorage.setItem(PENDING, '1');
		render(FindAgainOffer);
		await expect.poll(() => mocks.set).toHaveBeenCalledWith({ on: true });
		await expect.poll(shownText).toContain('Private events are on.');
		expect(sessionStorage.getItem(PENDING)).toBeNull();
	});

	it('shows nothing to someone who already has it on', async () => {
		mocks.beta.current = { canSave: true, on: true };
		render(FindAgainOffer);
		await new Promise((r) => setTimeout(r, 50));
		expect(page.getByTestId('find-again').elements()).toHaveLength(0);
		expect(mocks.set).not.toHaveBeenCalled();
	});
});
