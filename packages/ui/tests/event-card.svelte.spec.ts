import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventCard from '../src/EventCard.svelte';
import { event } from './fixtures.js';
import './theme.css';

it('shows decorative calendar and location icons beside event metadata', async () => {
	render(EventCard, {
		event: {
			...event,
			locations: [
				{
					$type: 'community.lexicon.location.address',
					locality: ' Berlin ',
					region: 'Berlin',
					country: 'Germany'
				}
			]
		}
	});

	const card = page.getByRole('link', { name: /Small web, big ideas/ });
	await expect.element(card).toBeVisible();
	const date = card.element().querySelector('p')!;
	expect(date.textContent).toMatch(/Oct 24/);
	expect(date.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	const location = page.getByText('Berlin', { exact: true });
	await expect.element(location).toBeVisible();
	expect(location.element().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	expect(location.element().textContent?.trim()).toBe('Berlin');
	expect(card.element().textContent).not.toContain('Germany');
});

it('does not fall back to a state or country when the city is missing', async () => {
	render(EventCard, {
		event: {
			...event,
			mode: undefined,
			locations: [
				{
					$type: 'community.lexicon.location.address',
					region: 'California',
					country: 'United States'
				}
			]
		}
	});
	const card = page.getByRole('link', { name: /Small web, big ideas/ });
	await expect.element(card).toBeVisible();
	expect(card.element().querySelectorAll('p')).toHaveLength(1);
	expect(card.element().textContent).not.toContain('California');
	expect(card.element().textContent).not.toContain('United States');
});

for (const [mode, label] of [
	['inperson', 'In-Person'],
	['hybrid', 'Hybrid'],
	['virtual', 'Virtual']
]) {
	it(`shows ${label} as a compact badge without a location icon when no location exists`, async () => {
		render(EventCard, {
			event: { ...event, mode: `community.lexicon.calendar.event#${mode}` }
		});

		const badge = page.getByText(label, { exact: true });
		await expect.element(badge).toBeVisible();
		expect(badge.element().classList.contains('border')).toBe(true);
		expect(getComputedStyle(badge.element()).fontSize).toBe('10px');
		expect(badge.element().parentElement!.querySelector('svg')).toBeNull();
	});
}

it('omits the metadata row when neither location nor mode exists', async () => {
	render(EventCard, { event: { ...event, mode: undefined } });
	const card = page.getByRole('link', { name: /Small web, big ideas/ });
	await expect.element(card).toBeVisible();
	expect(card.element().querySelectorAll('p')).toHaveLength(1);
});
