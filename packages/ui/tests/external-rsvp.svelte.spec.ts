import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ExternalRsvpNotice from '../src/event-view/ExternalRsvpNotice.svelte';
import './theme.css';

it('links to the original RSVP page in a new tab', async () => {
	const url = 'https://www.meetup.com/example/events/123/';
	render(ExternalRsvpNotice, { url });
	const link = page.getByRole('link', { name: 'RSVP on meetup.com', exact: true });
	await expect.element(link).toBeVisible();
	await expect.element(link).toHaveAttribute('href', url);
	await expect.element(link).toHaveAttribute('target', '_blank');
	expect(link.element().rel).toContain('noopener');
});
