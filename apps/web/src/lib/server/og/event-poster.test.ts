import { afterEach, expect, it, vi } from 'vitest';
import { loadEventPoster } from './event-poster';

const url = 'https://laugh.town/cdn/p/posters/47fee09eaa4c3fab.webp';
afterEach(() => vi.unstubAllGlobals());

it('loads a laugh.town CDN poster without permitting redirects', async () => {
	const bytes = Uint8Array.from([1, 2, 3]);
	const fetch = vi.fn(
		async () => new Response(bytes, { headers: { 'Content-Type': 'image/webp' } })
	);
	vi.stubGlobal('fetch', fetch);
	expect(await loadEventPoster({ name: 'Workshop', poster: { url } })).toEqual(bytes);
	expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'error' }));
});

it('also supports the Event Image URI fallback', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } })
		)
	);
	expect(
		await loadEventPoster({ name: 'Workshop', uris: [{ name: 'Event Image', uri: url }] })
	).toEqual(new Uint8Array([1]));
});

it.each([
	'https://127.0.0.1/image.webp',
	'https://evil.test/image.webp',
	'https://laugh.town.evil.test/cdn/p/posters/47fee09eaa4c3fab.webp',
	'https://laugh.town:444/cdn/p/posters/47fee09eaa4c3fab.webp',
	'https://laugh.town/anything-else',
	'http://laugh.town/cdn/p/posters/47fee09eaa4c3fab.webp'
])('never server-fetches an untrusted poster URL: %s', async (url) => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	expect(await loadEventPoster({ name: 'Workshop', poster: { url } })).toBeNull();
	expect(fetch).not.toHaveBeenCalled();
});

it('degrades to the generated avatar when a poster is unavailable', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			throw new Error('redirect or unavailable');
		})
	);
	expect(await loadEventPoster({ name: 'Workshop', poster: { url } })).toBeNull();
});
