import { page } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
import EventEditor from '../src/EventEditor.svelte';
import EventView from '../src/EventView.svelte';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

function theme(mode: string) {
	// Vitest's iframe explicitly sets light color-scheme; override that in this audit.
	document.documentElement.classList.remove('light', 'dark');
	document.documentElement.classList.add(mode);
	document.documentElement.style.colorScheme = mode;
	document.body.style.colorScheme = mode;
	document.body.style.background = 'var(--ui-page)';
	document.body.style.color = 'var(--ui-ink)';
}
async function audit() {
	await document.fonts.ready;
	const result = await axe.run(document.body, {
		runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
	});
	expect(
		result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) }))
	).toEqual([]);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
	if (import.meta.env.VITE_REVIEW_SCREENSHOTS) await page.screenshot();
}
afterEach(async () => {
	document.documentElement.classList.remove('light', 'dark');
	document.documentElement.style.removeProperty('color-scheme');
	document.body.removeAttribute('style');
	await page.viewport(1280, 1000);
});
for (const mode of ['light', 'dark']) {
	for (const width of [320, 1280]) {
		it(`event editor: ${mode}, ${width}px, saved mist/purple theme`, async () => {
			theme(mode);
			await page.viewport(width, 1000);
			render(EventEditor, {
				eventData: event,
				actorDid: event.did,
				rkey: event.rkey,
				adapter: createAdapter(),
				viewer
			});
			await expect
				.element(page.getByRole('textbox', { name: 'Event name' }))
				.toHaveTextContent(event.name);
			await audit();
		});
		it(`event detail: ${mode}, ${width}px, saved mist/purple theme`, async () => {
			theme(mode);
			await page.viewport(width, 1000);
			render(EventView, {
				data: {
					eventData: event,
					actorDid: event.did,
					rkey: event.rkey,
					hostProfile: { did: event.did, handle: viewer.handle, displayName: viewer.displayName },
					attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
				},
				adapter: createAdapter(),
				viewer,
				pageUrl: new URL('https://atmo.rsvp/test')
			});
			await expect.element(page.getByRole('button', { name: 'Going', exact: true })).toBeVisible();
			await audit();
		});
	}
}
