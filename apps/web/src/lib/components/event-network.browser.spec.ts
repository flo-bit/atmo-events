import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { EventComments } from '@atmo-dev/kit/events';
import { configureAtproto, getCDNImageBlobUrl } from '@atmo-dev/kit/events-data';

const postUri = 'at://did:plc:alice/app.bsky.feed.post/comment';

afterEach(() => {
	vi.unstubAllGlobals();
	configureAtproto({ appview: 'https://public.api.bsky.app', cdn: 'https://cdn.bsky.app' });
});

describe('shared event network settings', () => {
	it('uses the configured CDN in the browser', () => {
		configureAtproto({ cdn: 'https://cdn.test///' });
		expect(
			getCDNImageBlobUrl({
				did: 'did:plc:alice',
				blob: { $type: 'blob', ref: { $link: 'image-cid' } }
			})
		).toBe('https://cdn.test/img/feed_thumbnail/plain/did:plc:alice/image-cid@webp');
	});

	it('loads comments from the configured AppView', async () => {
		const fetchThread = vi.fn().mockResolvedValue(Response.json({ thread: { replies: [] } }));
		vi.stubGlobal('fetch', fetchThread);
		configureAtproto({ appview: 'https://appview.test///' });
		await render(EventComments, { postUri });

		await expect.element(page.getByText('No comments yet.')).toBeVisible();
		expect(fetchThread).toHaveBeenCalledExactlyOnceWith(
			`https://appview.test/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=6`,
			{ signal: expect.any(AbortSignal) }
		);
	});
});
