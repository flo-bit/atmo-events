import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CitiesPage from './+page.svelte';

// City names and qualifiers must survive query-string encoding.
describe('city links', () => {
	it('shows the fallback city and distance without extra explanatory copy', () => {
		const html = render(CitiesPage, {
			props: {
				data: {
					did: null,
					profile: null,
					canPostToBluesky: false,
					isModerator: false,
					pageTitle: 'Events nearby',
					pageDescription: 'Find events near you.',
					mode: 'events',
					locationSource: 'ip',
					radiusKm: 100,
					distanceKm: 28,
					detected: { city: 'Potsdam', country: 'DE', region: '' },
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
		expect(html).not.toContain('approximate IP location');
		expect(html).not.toContain('Listings refresh');
		expect(html).not.toContain('Upcoming in-person');
	});
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
						pageTitle: 'Events nearby',
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
