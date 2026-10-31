import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CitiesPage from './+page.svelte';

// Use the real $app/paths resolver: it inserts parameters verbatim and throws
// for leading/trailing slashes unless the caller encodes the path component.
describe('city links', () => {
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
						preferredSocialClient: null,
						preferredClientLoadFailed: false,
						canPostToBluesky: false,
						isModerator: false,
						pageTitle: 'Browse Cities',
						pageDescription: 'Find upcoming events by city on the open social web.',
						cities: [{ city, country, region, count: 1 }]
					}
				}
			}).body;
			const href = html.match(/href="([^"]+)"/)?.[1].replace(/&amp;/g, '&');
			expect(href).toBeDefined();
			const url = new URL(href!, 'https://atmo.test');
			expect(url.pathname).toBe(`/cities/${encodeURIComponent(city)}`);
			expect(decodeURIComponent(url.pathname.split('/').at(-1)!)).toBe(city);
			expect(url.hash).toBe('');
			expect([...url.searchParams]).toEqual([
				['country', country],
				['region', region]
			]);
		}
	);
});
