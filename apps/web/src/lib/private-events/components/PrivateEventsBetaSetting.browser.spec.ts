import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';

const mocks = vi.hoisted(() => ({
	beta: { ready: true, current: { canSave: false, on: false }, refresh: vi.fn(async () => {}) },
	set: vi.fn(),
	requestPermissions: vi.fn(async () => {})
}));
// The switch is a SvelteKit remote query and command, which a browser test has no server for.
vi.mock('../private-events.remote', () => ({
	getPrivateEventsBeta: () => mocks.beta,
	setPrivateEventsBeta: mocks.set
}));
vi.mock('@svelte-atproto/oauth/client', () => ({ requestPermissions: mocks.requestPermissions }));

import PrivateEventsBetaSetting from './PrivateEventsBetaSetting.svelte';
import { BETA_REQUIREMENTS, BETA_SCOPE } from '../beta';
import { HOST_SCOPES } from '../scopes';

beforeEach(() => {
	mocks.beta.ready = true;
	mocks.beta.current = { canSave: false, on: false };
});
afterEach(() => vi.clearAllMocks());

describe('turning on private events in Settings', () => {
	// Someone turning this on means to host, so the one consent covers hosting too, and creating a
	// private event afterwards doesn't ask again.
	it('asks once for saving the setting and for hosting private events', async () => {
		render(PrivateEventsBetaSetting);
		await page.getByRole('button', { name: 'Authorize now' }).click();
		await expect.poll(() => mocks.requestPermissions).toHaveBeenCalledTimes(1);
		expect(mocks.requestPermissions).toHaveBeenCalledWith(
			[BETA_SCOPE, ...HOST_SCOPES],
			expect.objectContaining({ saveReturnTo: true })
		);
	});

	// A server without spaces drops the hosting grant; the setting must still save there, so the
	// ask is done when saving is allowed, not when hosting is.
	it('requires only what saving the setting needs', async () => {
		render(PrivateEventsBetaSetting);
		await page.getByRole('button', { name: 'Authorize now' }).click();
		await expect.poll(() => mocks.requestPermissions).toHaveBeenCalled();
		expect(mocks.requestPermissions).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ requirements: [...BETA_REQUIREMENTS] })
		);
	});

	// Someone with it on whose new sign-in dropped the grant, e.g. a guest who turned it on from
	// an event, must not have to allow hosting just to turn it off.
	it('asks only to save the setting when it is already on', async () => {
		mocks.beta.current = { canSave: false, on: true };
		render(PrivateEventsBetaSetting);
		await page.getByRole('button', { name: 'Authorize now' }).click();
		await expect.poll(() => mocks.requestPermissions).toHaveBeenCalledTimes(1);
		expect(mocks.requestPermissions).toHaveBeenCalledWith(
			[BETA_SCOPE],
			expect.objectContaining({ requirements: [...BETA_REQUIREMENTS] })
		);
	});
});
