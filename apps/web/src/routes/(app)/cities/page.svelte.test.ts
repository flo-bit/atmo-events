import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CitiesPage from './+page.svelte';

// City names and qualifiers must survive query-string encoding.
describe('city links', () => {
	it.each(['ip', 'selected'] as const)(
		'shows fallback details and the right location note for %s',
		(source) => {
			const html = render(CitiesPage, {
				props: {
					data: {
						did: null,
						profile: null,
						canPostToBluesky: false,
						isModerator: false,
						pageTitle: 'Nearby',
						pageDescription: 'Find events near you.',
						mode: 'events',
						locationSource: source,
						radiusKm: 200,
						distanceKm: 28,
						detected: { city: 'Potsdam', country: 'DE', region: 'Brandenburg' },
						shown: { city: 'Berlin', country: 'DE', region: '', count: 1 },
						noLocalEvents: true,
						events: [],
						handles: {},
						cursor: null
					}
				}
			}).body;
			expect(html).toMatch(/Events near\s+Potsdam/);
			expect(html).toContain('Berlin');
			expect(html).toContain('28 km away');
			expect(html).not.toContain('Brandenburg');
			expect(html.includes('aria-label="About this location"')).toBe(source === 'ip');
			expect(html).not.toContain('Your location is estimated from your internet connection.');
			expect(html).not.toContain('approximate IP location');
			expect(html).not.toContain('Listings refresh');
			expect(html).not.toContain('Upcoming in-person');
		}
	);
	it.each(['Biel/Bienne', 'A?B', 'A#B', 'A%2FB', '/', '/Berlin', 'Berlin/', 'São Paulo'])(
		'preserves %s in the city-selection query without breaking rendering',
		(city) => {
			const country = 'CH';
			const region = 'A&B / C?';
			const html = render(CitiesPage, {
				props: {
					data: {
						did: null,
						profile: null,
						canPostToBluesky: false,
						isModerator: false,
						pageTitle: 'Nearby',
						pageDescription: 'Find events near you.',
						mode: 'choose',
						search: '',
						cities: [{ city, country, region }]
					}
				}
			}).body;
			const href = html.match(/href="([^"]+)"/)?.[1].replace(/&amp;/g, '&');
			expect(href).toBeDefined();
			const url = new URL(href!, 'https://atmo.test');
			expect(url.pathname).toBe('/cities');
			expect(url.hash).toBe('');
			expect([...url.searchParams]).toEqual([
				['city', city],
				['country', country],
				['region', region]
			]);
		}
	);
});
