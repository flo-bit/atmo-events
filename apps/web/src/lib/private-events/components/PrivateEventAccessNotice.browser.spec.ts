import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';

const mocks = vi.hoisted(() => ({
	requestPermissions: vi.fn<(scopes: unknown, options?: { returnTo?: string }) => Promise<void>>(
		async () => {}
	)
}));
vi.mock('@svelte-atproto/oauth/client', () => ({ requestPermissions: mocks.requestPermissions }));

import PrivateEventAccessNotice from './PrivateEventAccessNotice.svelte';

const DID = 'did:plc:guestguestguestguestguest';

afterEach(() => vi.clearAllMocks());

describe('asking for the permission from a private event’s page', () => {
	it('comes back to this page, marked as asked by this person', async () => {
		render(PrivateEventAccessNotice, {
			access: 'ask',
			did: DID,
			scopes: ['repo:community.lexicon.calendar.rsvp'],
			purpose: 'atmo needs your permission to answer.',
			label: 'Allow'
		});
		await page.getByRole('button', { name: 'Allow' }).click();
		await expect.poll(() => mocks.requestPermissions).toHaveBeenCalledTimes(1);
		const back = new URL(
			mocks.requestPermissions.mock.calls[0][1]?.returnTo ?? '',
			location.origin
		);
		expect(back.pathname).toBe(location.pathname);
		expect(back.searchParams.get('asked')).toBe(DID);
	});
});
