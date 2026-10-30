import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
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
