import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
import { socialClients, type PreferredSocialClient } from '@atmo-dev/kit/social';
import { starterPackClientUrl } from '../src/starter-pack-url.js';
import StarterPackButton from '../src/StarterPackButton.svelte';
import StarterPackPlacementFixture from './StarterPackPlacementFixture.svelte';
import StarterPackCountsFixture from './StarterPackCountsFixture.svelte';
import { event } from './fixtures.js';
import './theme.css';

afterEach(() => vi.restoreAllMocks());
const url = 'https://bsky.app/starter-pack/did:plc:bot/pack';
function tab() {
	const replace = vi.fn();
	const close = vi.fn();
	const target = { opener: window, closed: false, location: { replace }, close };
	const open = vi.spyOn(window, 'open').mockReturnValue(target as unknown as Window);
	return { target, replace, close, open };
}

describe('starter pack button', () => {
	const clients: { selection: PreferredSocialClient | null; label: string; base: string }[] = [
		...socialClients.map(({ id, label, url }) => ({ selection: { client: id }, label, base: url })),
		{
			selection: { client: 'custom', customUrl: 'https://client.test/app' },
			label: 'Custom client',
			base: 'https://client.test/app'
		},
		{ selection: null, label: 'Bluesky', base: 'https://bsky.app' }
	];
	it.each(clients)('opens the starter pack in $label', async ({ selection, label, base }) => {
		const opened = tab();
		const openPack = vi.fn().mockResolvedValue(url);
		render(StarterPackButton, { eventUri: event.uri, openPack, socialClient: selection });
		await expect
			.element(page.getByText(`Follow attendees on ${label}.`, { exact: true }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		const expected = `${base}/starter-pack/did:plc:bot/pack`;
		await expect
			.element(page.getByRole('link', { name: 'Starter pack ↗' }))
			.toHaveAttribute('href', expected);
		expect(opened.replace).toHaveBeenCalledExactlyOnceWith(expected);
		expect(openPack).toHaveBeenCalledExactlyOnceWith(event.uri);
	});
	it('updates a resolved pack link when the viewer changes clients, without creating another pack', async () => {
		const opened = tab();
		const openPack = vi.fn().mockResolvedValue(url);
		const { rerender } = await render(StarterPackButton, {
			eventUri: event.uri,
			openPack,
			socialClient: { client: 'mu' }
		});
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		await expect
			.element(page.getByRole('link', { name: 'Starter pack ↗' }))
			.toHaveAttribute('href', 'https://mu.social/starter-pack/did:plc:bot/pack');
		await rerender({ socialClient: { client: 'blacksky' } });
		await expect
			.element(page.getByRole('link', { name: 'Starter pack ↗' }))
			.toHaveAttribute('href', 'https://blacksky.community/starter-pack/did:plc:bot/pack');
		await expect.element(page.getByText('Follow attendees on Blacksky.')).toBeVisible();
		expect(openPack).toHaveBeenCalledTimes(1);
		expect(opened.replace).toHaveBeenCalledTimes(1);
	});
	it.each([
		'javascript:alert(1)',
		'https://evil.test/starter-pack/bot/pack',
		'https://bsky.app/profile/bot'
	])('rejects invalid service links: %s', async (badUrl) => {
		const opened = tab();
		render(StarterPackButton, { eventUri: event.uri, openPack: async () => badUrl });
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		await expect.element(page.getByRole('alert')).toBeVisible();
		expect(opened.close).toHaveBeenCalledOnce();
		expect(opened.replace).not.toHaveBeenCalled();
	});
	it('preserves the pack identity and query when using a custom base path', () => {
		expect(
			starterPackClientUrl(`${url}?view=members#list`, {
				client: 'custom',
				customUrl: 'https://client.test/app/'
			})
		).toBe('https://client.test/app/starter-pack/did:plc:bot/pack?view=members#list');
	});
	it('opens a tab synchronously, prevents duplicate submissions, then reuses the pack URL', async () => {
		const opened = tab();
		let finish!: (value: string) => void;
		const openPack = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					finish = resolve;
				})
		);
		render(StarterPackButton, { eventUri: event.uri, openPack });
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		expect(opened.open).toHaveBeenCalledWith('about:blank', '_blank');
		expect(opened.target.opener).toBeNull();
		await expect.element(page.getByRole('button', { name: 'Opening…' })).toBeDisabled();
		expect(openPack).toHaveBeenCalledExactlyOnceWith(event.uri);
		finish(url);
		await expect
			.element(page.getByRole('link', { name: 'Starter pack ↗' }))
			.toHaveAttribute('href', url);
		await expect
			.element(page.getByRole('link', { name: 'Starter pack ↗' }))
			.toHaveAttribute('target', '_blank');
		expect(opened.replace).toHaveBeenCalledWith(url);
		expect(openPack).toHaveBeenCalledTimes(1);
		expect(opened.open).toHaveBeenCalledTimes(1);
	});
	it('closes the blank tab on failure and allows retry', async () => {
		const opened = tab();
		const openPack = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(url);
		render(StarterPackButton, { eventUri: event.uri, openPack });
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Couldn’t open the starter pack. Please try again.');
		expect(opened.close).toHaveBeenCalledOnce();
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		expect(opened.replace).toHaveBeenCalledWith(url);
	});
	it.each([
		[0, 0],
		[3, 2],
		[5, 0],
		[0, 5]
	])('hides the pack for %s going and %s interested', async (goingCount, interestedCount) => {
		render(StarterPackPlacementFixture, { goingCount, interestedCount });
		await expect
			.element(page.getByRole('button', { name: 'Starter pack ↗' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('Follow attendees on Bluesky.')).not.toBeInTheDocument();
	});
	it.each([
		[6, 0],
		[0, 6],
		[3, 3]
	])('shows the pack for %s going and %s interested', async (goingCount, interestedCount) => {
		render(StarterPackPlacementFixture, { goingCount, interestedCount });
		await expect.element(page.getByRole('button', { name: 'Starter pack ↗' })).toBeVisible();
	});
	it('updates the threshold on RSVP changes without replacing totals with hydrated list lengths', async () => {
		render(StarterPackCountsFixture);
		const pack = page.getByRole('button', { name: 'Starter pack ↗' });
		await expect.element(pack).not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Join', exact: true }).click();
		await expect.element(pack).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^5\s*Going/i })).toBeVisible();
		await page.getByRole('button', { name: 'Switch to interested', exact: true }).click();
		await expect.element(pack).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^4\s*Going/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^2\s*Interested/i })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel RSVP', exact: true }).click();
		await expect.element(pack).not.toBeInTheDocument();
	});
	it('renders below Interested with link styling and remains accessible', async () => {
		render(StarterPackPlacementFixture);
		const pack = page.getByRole('button', { name: 'Starter pack ↗' });
		const attendees = page.getByRole('button', { name: /^2\s*Interested/i });
		await expect.element(pack).toBeVisible();
		await expect.element(pack).toHaveAttribute('data-variant', 'link');
		await expect.element(page.getByText('Follow attendees on Bluesky.')).toBeVisible();
		await expect.element(attendees).toBeVisible();
		expect(
			attendees.element().compareDocumentPosition(pack.element()) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		const audit = await axe.run(document.body, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
		});
		expect(audit.violations.map(({ id }) => id)).toEqual([]);
		if (import.meta.env.VITE_REVIEW_SCREENSHOTS) await page.screenshot();
	});
});
