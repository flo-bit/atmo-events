import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ShareModal from '../src/ShareModal.svelte';
import PostToBlueskyModal from '../src/PostToBlueskyModal.svelte';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const url = 'https://atmo.rsvp/p/host.example.com/e/test-event';
const props = {
	open: true,
	url,
	eventDid: event.did,
	eventRkey: event.rkey,
	eventName: event.name,
	shareText: `Join us! ${url}`
};

describe('Bluesky cross-post permission', () => {
	it('leaves space between the share text and event preview', async () => {
		render(ShareModal, { ...props, adapter: createAdapter(), viewer });
		await expect.element(page.getByText('Join us!', { exact: true })).toHaveStyle({ marginBottom: '12px' });
	});
	it.each([false, undefined])(
		'offers manual sharing, not direct posting, for permission %s',
		async (canPostToBluesky) => {
			const adapter = createAdapter();
			render(ShareModal, { ...props, adapter, viewer: { ...viewer, canPostToBluesky } });
			await expect
				.element(page.getByRole('button', { name: 'Share to Bluesky' }))
				.not.toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: 'Share to Bluesky' }))
				.toHaveAttribute(
					'href',
					`https://bsky.app/intent/compose?text=${encodeURIComponent(props.shareText)}`
				);
			expect(adapter.createRecord).not.toHaveBeenCalled();
		}
	);

	it('shows direct posting only for an authenticated, permitted viewer', async () => {
		render(ShareModal, { ...props, adapter: createAdapter(), viewer });
		await page.getByRole('button', { name: 'Share to Bluesky' }).click();
		await expect.element(page.getByRole('button', { name: 'Post', exact: true })).toBeVisible();
	});

	it('closes a previously opened composer when permission is removed', async () => {
		const adapter = createAdapter();
		const { rerender } = await render(ShareModal, { ...props, adapter, viewer });
		await page.getByRole('button', { name: 'Share to Bluesky' }).click();
		await expect.element(page.getByRole('button', { name: 'Post', exact: true })).toBeVisible();
		await rerender({ viewer: { ...viewer, canPostToBluesky: false } });
		await expect
			.element(page.getByRole('button', { name: 'Post', exact: true }))
			.not.toBeInTheDocument();
		expect(adapter.createRecord).not.toHaveBeenCalled();
	});

	it('does not trust a capability without an authenticated session', async () => {
		render(ShareModal, {
			...props,
			adapter: createAdapter(),
			viewer: { ...viewer, isLoggedIn: false }
		});
		await expect
			.element(page.getByRole('button', { name: 'Share to Bluesky' }))
			.not.toBeInTheDocument();
	});

	it('also disables posting if the inner composer is mounted directly without permission', async () => {
		const adapter = createAdapter();
		render(PostToBlueskyModal, {
			open: true,
			eventDid: event.did,
			eventRkey: event.rkey,
			eventName: event.name,
			eventUrl: url,
			initialText: 'Join us!',
			adapter,
			viewer: { ...viewer, canPostToBluesky: false }
		});
		await expect.element(page.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();
		expect(adapter.createRecord).not.toHaveBeenCalled();
	});
});
