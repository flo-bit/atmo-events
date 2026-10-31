import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { socialClients, type PreferredSocialClient } from '@atmo-dev/kit/social';
import { buildDescriptionHtml } from '../src/event-view/format.js';
import { getLocalProfileUrl } from '../src/profile-url.js';
import EventView from '../src/EventView.svelte';
import { event, viewer, createAdapter } from './fixtures.js';
import './theme.css';

const description = '👋 @alice.test #café';
function facet(text: string, feature: Record<string, string>) {
	const index = description.indexOf(text);
	return {
		index: {
			byteStart: new TextEncoder().encode(description.slice(0, index)).length,
			byteEnd: new TextEncoder().encode(description.slice(0, index + text.length)).length
		},
		features: [feature]
	};
}
const facets = [
	facet('@alice.test', { $type: 'app.bsky.richtext.facet#mention', did: 'did:web:alice.test' }),
	facet('#café', { $type: 'app.bsky.richtext.facet#tag', tag: 'café' })
];

function links(html: string | null) {
	return new DOMParser().parseFromString(html ?? '', 'text/html');
}
const clients: { selection: PreferredSocialClient | null; url: string }[] = [
	...socialClients.map(({ id, url }) => ({ selection: { client: id }, url })),
	{
		selection: { client: 'custom', customUrl: 'https://custom.test/app' },
		url: 'https://custom.test/app'
	},
	{ selection: null, url: 'https://bsky.app' }
];

describe('description links', () => {
	it.each(clients)(
		'uses $url for hashtags and RSVP profiles for facet mentions',
		({ selection, url }) => {
			const doc = links(buildDescriptionHtml(description, facets, selection));
			const [mention, tag] = doc.querySelectorAll('a');
			expect(mention.getAttribute('href')).toBe('/p/did%3Aweb%3Aalice.test');
			expect(mention.hasAttribute('target')).toBe(false);
			expect(tag.getAttribute('href')).toBe(`${url}/hashtag/caf%C3%A9`);
			expect(tag.target).toBe('_blank');
			expect(doc.body.textContent?.trim()).toBe(description);
		}
	);
	it('linkifies unfaceted descriptions without rewriting Markdown links or code', () => {
		const doc = links(
			buildDescriptionHtml(
				'@alice.test #events [Website](https://example.com/#keep) `@code.test #code`',
				undefined,
				{ client: 'blacksky' }
			)
		);
		expect([...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
			'/p/alice.test',
			'https://blacksky.community/hashtag/events',
			'https://example.com/#keep'
		]);
		expect(doc.querySelector('code')?.textContent).toBe('@code.test #code');
		expect(doc.querySelector('code a')).toBeNull();
	});
	it('encodes actors into a single local path component', () => {
		expect(getLocalProfileUrl('did:web:alice.test:user')).toBe('/p/did%3Aweb%3Aalice.test%3Auser');
		expect(getLocalProfileUrl('bad/actor?#')).toBe('/p/bad%2Factor%3F%23');
	});
	it('updates event-description hashtags with the viewer’s selection, keeping mentions local', async () => {
		const { rerender } = await render(EventView, {
			data: {
				eventData: { ...event, description, facets },
				actorDid: event.did,
				rkey: event.rkey,
				hostProfile: { did: event.did, handle: viewer.handle },
				attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
			},
			adapter: createAdapter(),
			viewer: { ...viewer, preferredSocialClient: { client: 'mu' } },
			pageUrl: new URL('https://atmo.rsvp/p/host.test/e/event')
		});
		await expect
			.element(page.getByRole('link', { name: '#café', exact: true }))
			.toHaveAttribute('href', 'https://mu.social/hashtag/caf%C3%A9');
		await expect
			.element(page.getByRole('link', { name: '@alice.test', exact: true }))
			.toHaveAttribute('href', '/p/did%3Aweb%3Aalice.test');
		await rerender({ viewer: { ...viewer, preferredSocialClient: { client: 'witchsky' } } });
		await expect
			.element(page.getByRole('link', { name: '#café', exact: true }))
			.toHaveAttribute('href', 'https://witchsky.app/hashtag/caf%C3%A9');
	});
});
