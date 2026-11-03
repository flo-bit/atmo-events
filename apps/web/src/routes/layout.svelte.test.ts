import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
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

function head() {
	return render(Layout, {
		props: { children: createRawSnippet(() => ({ render: () => '<div></div>' })) }
	}).head;
}

beforeEach(() => {
	page.data = {};
	page.error = null;
	page.status = 200;
});

describe('page AT metadata', () => {
	it('renders route metadata for both app and embed pages in the root layout', () => {
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
