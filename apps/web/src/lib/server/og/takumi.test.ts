import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_PLACEHOLDERS, withOgRenderer } from './takumi';

const markup = `<div class="flex h-full w-full bg-black"><img src="${IMAGE_PLACEHOLDERS.card}" width="200" height="200" /></div>`;
const size = { width: 400, height: 210 };

afterEach(() => vi.restoreAllMocks());

const emojiSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="#f00"/></svg>';
const title = (text: string) =>
	`<div class="flex h-full w-full bg-black p-8"><h1 class="text-5xl text-neutral-50">${text}</h1></div>`;

describe('emoji', () => {
	it('loads each distinct emoji from Twemoji and draws it', async () => {
		const fetch = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(
				async () => new Response(emojiSvg, { headers: { 'Content-Type': 'image/svg+xml' } })
			);
		const withEmoji = await withOgRenderer((r) => r.renderHtml(title('Hi 🎉 🎉 ✊🏾'), size));
		const urls = fetch.mock.calls.map(([url]) => String(url)).sort();
		expect(urls).toHaveLength(2);
		for (const url of urls)
			expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/jdecked\/twemoji@/);
		// An emoji Twemoji doesn't have renders blank; the card still renders.
		vi.spyOn(globalThis, 'fetch').mockImplementation(
			async () => new Response('not found', { status: 404 })
		);
		const blank = await withOgRenderer((r) => r.renderHtml(title('Hi 🎉 🎉 ✊🏾'), size));
		expect(Buffer.from(withEmoji).equals(Buffer.from(blank))).toBe(false);
	});

	it.each([
		['a network error', () => Promise.reject(new Error('offline'))],
		['a server error', async () => new Response('busy', { status: 503 })],
		[
			'a non-SVG response',
			async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })
		]
	])('fails the card on %s, so it is not stored with a missing emoji', async (_, response) => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(response);
		await expect(withOgRenderer((r) => r.renderHtml(title('Hi 🎉'), size))).rejects.toThrow();
	});

	it('caps how many emoji one card loads', async () => {
		const fetch = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(
				async () => new Response(emojiSvg, { headers: { 'Content-Type': 'image/svg+xml' } })
			);
		const many = [...'😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙😚🙂🤗'].join(' ');
		await withOgRenderer((r) => r.renderHtml(title(many), size));
		expect(fetch).toHaveBeenCalledTimes(16);
	});

	it('does not touch the network for text without emoji', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch');
		await withOgRenderer((r) =>
			r.renderHtml(title('Café Zürich – «quoted» € &amp; 5 &gt; 4'), size)
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('withOgRenderer', () => {
	it('never reuses an earlier image for the same placeholder key', async () => {
		const render = (file: string) =>
			withOgRenderer((renderer) =>
				renderer.renderHtml(markup, size, { [IMAGE_PLACEHOLDERS.card]: readFileSync(file) })
			);
		const first = await render('static/topics/sustainability.jpg');
		const second = await render('static/topics/arts-culture.jpg');
		expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
		// Deterministic for the same input.
		expect(Buffer.from(await render('static/topics/sustainability.jpg'))).toEqual(
			Buffer.from(first)
		);
	});

	it('applies Tailwind classes and fonts', async () => {
		const png = await withOgRenderer((renderer) =>
			renderer.renderHtml(
				'<div class="flex h-full w-full bg-black p-8"><h1 class="text-5xl font-bold text-neutral-50">Hi</h1></div>',
				size
			)
		);
		expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
		// A black background means `bg-black` was applied (the default is white).
		const plain = await withOgRenderer((renderer) =>
			renderer.renderHtml('<div class="flex h-full w-full p-8"><h1>Hi</h1></div>', size)
		);
		expect(png.length).not.toBe(plain.length);
	});
});
