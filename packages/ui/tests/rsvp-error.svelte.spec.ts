import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventRsvp from '../src/EventRsvp.svelte';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

describe('RSVP errors', () => {
	it('shows an error when saving fails and clears it on retry', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const adapter = createAdapter();
		vi.mocked(adapter.putRecord).mockRejectedValueOnce(new Error('offline'));
		render(EventRsvp, { eventUri: event.uri, eventCid: null, adapter, viewer });

		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Couldn’t save your RSVP. Please try again.');
		await expect.element(page.getByRole('button', { name: 'Going', exact: true })).toBeEnabled();

		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect.element(page.getByText("You're Going", { exact: true })).toBeVisible();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('shows an error when removing fails and keeps the RSVP', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const adapter = createAdapter();
		vi.mocked(adapter.deleteRecord).mockRejectedValueOnce(new Error('offline'));
		render(EventRsvp, {
			eventUri: event.uri,
			eventCid: null,
			initialRsvpStatus: 'going',
			initialRsvpRkey: 'rsvp-key',
			adapter,
			viewer
		});

		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Couldn’t remove your RSVP. Please try again.');
		await expect.element(page.getByText("You're Going", { exact: true })).toBeVisible();
	});
});
