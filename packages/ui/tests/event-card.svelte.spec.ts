import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventCard from '../src/EventCard.svelte';
import { event } from './fixtures.js';
import './theme.css';

it('links to the event and shows its date and city', async () => {
	render(EventCard, {
		actor: 'host.example.com',
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
	await expect.element(card).toHaveAttribute('href', '/p/host.example.com/e/test-event');
	const date = card.element().querySelector('p')!;
	expect(date.textContent).toMatch(/Oct 24/);
	expect(date.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	const location = page.getByText('Berlin', { exact: true });
	await expect.element(location).toBeVisible();
	expect(location.element().parentElement!.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
		'true'
	);
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
	expect(card.element().textContent).not.toContain('California');
	expect(card.element().textContent).not.toContain('United States');
});

for (const [mode, label] of [
	['inperson', 'In-Person'],
	['hybrid', 'Hybrid'],
	['virtual', 'Virtual']
]) {
	it(`shows the ${label} event mode`, async () => {
		render(EventCard, {
			event: { ...event, mode: `community.lexicon.calendar.event#${mode}` }
		});

		const badge = page.getByText(label, { exact: true });
		await expect.element(badge).toBeVisible();
	});
}

for (const [location, label] of [
	[
		{ $type: 'community.lexicon.location.geo', latitude: '52.52', longitude: '13.405' },
		'52.52000, 13.40500'
	],
	[
		{ $type: 'community.lexicon.location.fsq', fsq_place_id: 'venue-123', name: 'Comedy Club' },
		'Comedy Club'
	],
	[{ $type: 'community.lexicon.location.hthree', value: '872681a33ffffff' }, 'H3: 872681a33ffffff'],
	[
		{
			$type: 'community.lexicon.calendar.event#uri',
			uri: 'https://example.com/join',
			name: 'Join online'
		},
		'Join online'
	]
] as const) {
	it(`shows ${location.$type} on event cards without nesting location links`, async () => {
		render(EventCard, { event: { ...event, mode: undefined, locations: [location] } });
		const card = page.getByRole('link', { name: /Small web, big ideas/ });
		await expect.element(page.getByText(label, { exact: true })).toBeVisible();
		expect(card.element().querySelector('a')).toBeNull();
	});
}
