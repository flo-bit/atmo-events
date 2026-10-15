import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadThumbnail } from './thumbnail';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('bounded thumbnail loading', () => {
	it('hands a data URI to Satori so the renderer does not refetch the image', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(Uint8Array.from([1, 2, 3]), {
					headers: { 'Content-Type': 'image/png' }
				})
		);
		vi.stubGlobal('fetch', fetch);
		expect(await loadThumbnail('https://cdn.bsky.app/image.png')).toBe(
			'data:image/png;base64,AQID'
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('rejects upstream errors and non-image content', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('not an image', {
						headers: { 'Content-Type': 'text/html' }
					})
			)
		);
		await expect(loadThumbnail('https://cdn.bsky.app/image.png')).rejects.toThrow('unavailable');
	});

	it('bounds bytes even when Content-Length is missing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
						headers: { 'Content-Type': 'image/png' }
					})
			)
		);
		await expect(loadThumbnail('https://cdn.bsky.app/image.png')).rejects.toThrow('size limit');
	});

	it('aborts a stalled upstream request after five seconds', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url, { signal }) =>
					new Promise((_resolve, reject) => {
						signal.addEventListener('abort', () => reject(new Error('aborted')));
					})
			)
		);
		const pending = expect(loadThumbnail('https://cdn.bsky.app/image.png')).rejects.toThrow(
			'aborted'
		);
		await vi.advanceTimersByTimeAsync(5000);
		await pending;
		expect(vi.getTimerCount()).toBe(0);
	});
});
