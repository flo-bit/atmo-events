import { page } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ExternalRsvpNotice from '../src/event-view/ExternalRsvpNotice.svelte';
import './theme.css';

afterEach(async () => {
	await page.viewport(1280, 1000);
});

for (const width of [320, 768, 1280]) {
	it(`keeps the external RSVP arrow compact at ${width}px`, async () => {
		await page.viewport(width, 1000);
		const url = 'https://www.meetup.com/example/events/123/';
		render(ExternalRsvpNotice, { url });
		const link = page.getByRole('link', { name: 'RSVP on meetup.com', exact: true });
		await expect.element(link).toBeVisible();
		await expect.element(link).toHaveAttribute('href', url);
		await expect.element(link).toHaveAttribute('target', '_blank');

		const button = link.element();
		const icon = button.querySelector('svg')!;
		expect(icon.getBoundingClientRect().width).toBe(16);
		expect(icon.getBoundingClientRect().height).toBe(16);
		expect(button.getBoundingClientRect().height).toBeLessThan(60);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
	});
}
