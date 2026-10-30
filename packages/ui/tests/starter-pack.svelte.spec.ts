import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
import StarterPackButton from '../src/StarterPackButton.svelte';
import StarterPackPlacementFixture from './StarterPackPlacementFixture.svelte';
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
		await expect.element(page.getByRole('button', { name: 'Starter pack ↗' })).toBeEnabled();
		expect(opened.replace).toHaveBeenCalledWith(url);
		await page.getByRole('button', { name: 'Starter pack ↗' }).click();
		expect(openPack).toHaveBeenCalledTimes(1);
		expect(opened.open).toHaveBeenLastCalledWith(url, '_blank', 'noopener,noreferrer');
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
	it('renders above attendees and remains accessible on the event page', async () => {
		render(StarterPackPlacementFixture);
		const pack = page.getByRole('button', { name: 'Starter pack ↗' });
		const attendees = page.getByRole('button', { name: /^1\s*Going/i });
		await expect.element(pack).toBeVisible();
		await expect.element(attendees).toBeVisible();
		expect(
			pack.element().compareDocumentPosition(attendees.element()) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		const audit = await axe.run(document.body, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
		});
		expect(audit.violations.map(({ id }) => id)).toEqual([]);
		if (import.meta.env.VITE_REVIEW_SCREENSHOTS) await page.screenshot();
	});
});
