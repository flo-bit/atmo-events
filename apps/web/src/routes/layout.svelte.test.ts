import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { configureAtproto, getCDNImageBlobUrl } from '@atmo-dev/kit/events-data';
import Layout from './+layout.svelte';
import type { AtTagMetadata } from '@atmo-dev/kit/at-tags';

const { page } = vi.hoisted(() => ({
	page: {
		data: {} as { pageTitle?: string; atTags?: AtTagMetadata },
		error: null as { message: string } | null,
		status: 200
	}
}));
vi.mock('$app/state', () => ({ page }));
vi.mock('$app/env/public', async () =>
	(await import('../test/public-env')).publicEnv({ PUBLIC_CDN_URL: 'https://cdn.test/' })
);

function head() {
	return render(Layout, {
		props: { children: createRawSnippet(() => ({ render: () => '<div></div>' })) }
	}).head;
}

beforeEach(() => {
	page.data = {};
	page.error = null;
	page.status = 200;
	configureAtproto({ appview: 'https://public.api.bsky.app', cdn: 'https://cdn.bsky.app' });
});

describe('page AT metadata', () => {
	it('renders route metadata in the root layout', () => {
		page.data.atTags = {
			canonical: ['at://did:plc:host/community.lexicon.calendar.event/event'],
			author: ['at://did:plc:host']
		};
		expect(head()).toContain('name="at:canonical"');
		expect(head()).toContain('name="at:author"');
	});

	it('does not emit stale record metadata on an error page', () => {
		page.data.atTags = { canonical: ['at://did:plc:host/community.lexicon.calendar.event/event'] };
		page.error = { message: 'Event not found' };
		page.status = 404;
		expect(head()).not.toContain('name="at:');
	});

	it('leaves discovery and other non-record pages untagged', () => {
		expect(head()).not.toContain('name="at:');
	});
});

describe('root layout', () => {
	it('points the shared components at the image CDN a setting names', () => {
		const image = () =>
			getCDNImageBlobUrl({
				did: 'did:plc:alice',
				blob: { $type: 'blob', ref: { $link: 'image-cid' } }
			});
		expect(image()).not.toMatch(/^https:\/\/cdn\.test\//);

		// render() is lazy: the layout runs when its body is read.
		const { body } = render(Layout, {
			props: { children: createRawSnippet(() => ({ render: () => '<main></main>' })) }
		});
		expect(body).toContain('<main></main>');

		expect(image()).toMatch(/^https:\/\/cdn\.test\/img\//);
	});
});
