import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { socialClients, type PreferredSocialClient } from '@atmo-dev/kit/social';
import EventComments from '../src/EventComments.svelte';
import EventView from '../src/EventView.svelte';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const postUri = 'at://did:web:host.test/app.bsky.feed.post/root';
function reply(did: string, rkey: string, replies: unknown[] = []) {
	return {
		$type: 'app.bsky.feed.defs#threadViewPost',
		post: {
			uri: `at://${did}/app.bsky.feed.post/${rkey}`,
			author: { did, handle: 'alice.test', displayName: rkey },
			record: { text: rkey },
			likeCount: 3
		},
		replies
	};
}
const fetchThread = vi.fn();
beforeEach(() => {
	fetchThread.mockReset().mockImplementation(
		async () =>
			new Response(
				JSON.stringify({
					thread: {
						replies: [reply('did:web:alice.test', 'first', [reply('did:web:bob.test', 'nested')])]
					}
				})
			)
	);
	vi.stubGlobal('fetch', fetchThread);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const clients: { selection: PreferredSocialClient | null; label: string; url: string }[] = [
	...socialClients.map(({ id, label, url }) => ({ selection: { client: id }, label, url })),
	{
		selection: { client: 'custom', customUrl: 'https://custom.test/app' },
		label: 'Custom client',
		url: 'https://custom.test/app'
	},
	{ selection: null, label: 'Bluesky', url: 'https://bsky.app' }
];

describe('preferred client in event comments', () => {
	it.each(clients)(
		'uses $label for the comment prompt and nested reply/like links',
		async ({ selection, label, url }) => {
			await render(EventComments, { postUri, socialClient: selection });
			await expect
				.element(page.getByRole('link', { name: `Add a comment on ${label}`, exact: false }))
				.toHaveAttribute('href', `${url}/profile/did:web:host.test/post/root`);
			await expect
				.element(page.getByRole('link', { name: 'Reply', exact: true }).first())
				.toHaveAttribute('href', `${url}/profile/did:web:alice.test/post/first`);
			await expect
				.element(page.getByRole('link', { name: 'Reply', exact: true }).last())
				.toHaveAttribute('href', `${url}/profile/did:web:bob.test/post/nested`);
			await expect
				.element(page.getByRole('link', { name: '3 likes', exact: true }).last())
				.toHaveAttribute('href', `${url}/profile/did:web:bob.test/post/nested`);
			expect(document.querySelector('[data-slot="comments"] article a')?.getAttribute('href')).toBe(
				`${url}/profile/did:web:alice.test`
			);
		}
	);

	it('updates links when the selection changes without fetching the thread again', async () => {
		const { rerender } = await render(EventComments, { postUri, socialClient: { client: 'mu' } });
		await expect
			.element(page.getByRole('link', { name: 'Reply', exact: true }).first())
			.toHaveAttribute('href', 'https://mu.social/profile/did:web:alice.test/post/first');
		await rerender({ socialClient: { client: 'blacksky' } });
		await expect
			.element(page.getByRole('link', { name: /Add a comment on Blacksky/ }))
			.toHaveAttribute('href', 'https://blacksky.community/profile/did:web:host.test/post/root');
		await expect
			.element(page.getByRole('link', { name: '3 likes', exact: true }).last())
			.toHaveAttribute('href', 'https://blacksky.community/profile/did:web:bob.test/post/nested');
		expect(fetchThread).toHaveBeenCalledTimes(1);
	});

	it.each(['', 'About this event'])(
		'passes the viewer selection through EventView (description: %s)',
		async (description) => {
			await render(EventView, {
				data: {
					eventData: {
						...event,
						description,
						bskyPostRef: { uri: postUri, cid: 'cid', showComments: true }
					},
					actorDid: event.did,
					rkey: event.rkey,
					hostProfile: { did: event.did, handle: viewer.handle },
					attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
				},
				adapter: createAdapter(),
				viewer: { ...viewer, preferredSocialClient: { client: 'witchsky' } },
				pageUrl: new URL('https://atmo.rsvp/p/host.test/e/event')
			});
			if (description) await page.getByRole('radio', { name: 'Comments', exact: true }).click();
			await expect
				.element(page.getByRole('link', { name: /Add a comment on Witchsky/ }))
				.toHaveAttribute('href', 'https://witchsky.app/profile/did:web:host.test/post/root');
		}
	);
});
