// For browser tests of the pages that hold a private event's link embeds until they're asked for.
import { expect } from 'vitest';
import { page } from 'vitest/browser';

/** A Klipy GIF: alone on its line, a link shows as an embed, which asks the GIF host for it. */
export const GIF = 'https://static.klipy.com/ii/abc123/def456.gif';

/** A description, as the editor takes it, with the GIF on a line of its own. */
export const DESCRIPTION_WITH_GIF = `Bring snacks\n\n${GIF}`;

/** The button that loads a held embed. */
export const loadButton = () => page.getByRole('button', { name: /^Load / });

/** Anything the page asked the GIF host for: a fetch, or a media element pointing there. */
export function gifHostRequests(seen: string[] = []): string[] {
	const media = [...document.querySelectorAll('[src]')].map((e) => e.getAttribute('src') ?? '');
	const loaded = performance.getEntriesByType('resource').map((e) => e.name);
	return [...seen, ...media, ...loaded].filter((url) => /klipy\.com|k\.gifs\.bsky\.app/.test(url));
}

/** Once the GIF's embed is held or has asked for it, whichever this page does. */
export async function embedSettled(seen: () => string[] = () => []): Promise<void> {
	await expect
		.poll(() => loadButton().elements().length > 0 || gifHostRequests(seen()).length > 0)
		.toBe(true);
}
