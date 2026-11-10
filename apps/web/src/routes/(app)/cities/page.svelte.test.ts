import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CitiesPage from './+page.svelte';

// City names and qualifiers must survive query-string encoding.
describe('city links', () => {
	it('shows the empty city and the closest city without extra explanatory text', () => {
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
					detected: { city: 'Potsdam', country: 'DE', region: '' },
					shown: { city: 'Berlin', country: 'DE', region: '', count: 1 },
					noLocalEvents: true,
					events: [],
					handles: {},
					cursor: null
				}
			}
		}).body;
		expect(html).toContain('Events in Potsdam');
		expect(html).toContain('No events in Potsdam');
		expect(html).toContain('Events in Berlin');
		expect(html).not.toContain('approximate IP location');
	});
	it.each(['Biel/Bienne', 'A?B', 'A#B', 'A%2FB', '/', '/Berlin', 'Berlin/', 'São Paulo'])(
		'preserves %s as one encoded path component without breaking rendering',
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
