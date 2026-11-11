import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';
import PrivatePage from './+page.svelte';

const base = { pageTitle: 'Private events', did: 'did:plc:person', spacesServer: null };

describe('/private', () => {
	it('says the link is the invitation when there is nothing to list', async () => {
		render(PrivatePage, { data: { ...base, events: [], access: null } } as never);
		await expect.element(page.getByTestId('link-is-invitation')).toBeVisible();
	});

	it('says it under a list too, since an unanswered invitation is never on the list', async () => {
		const event = {
			name: 'A party',
			startsAt: '2030-01-01T18:00:00Z',
			did: 'did:plc:host',
			rkey: '3kabc',
			uri: 'at://did:plc:host/community.lexicon.calendar.event/3kabc',
			createdAt: '2029-01-01T00:00:00Z',
			rsvpsCount: 0,
			rsvpsGoingCount: 0
		};
		render(PrivatePage, {
			data: {
				...base,
				access: null,
				events: [{ event, href: '/p/x/private/3kabc', hosting: true, hostHandle: null }]
			}
		} as never);
		await expect.element(page.getByTestId('private-events')).toBeVisible();
		await expect.element(page.getByTestId('link-is-invitation')).toBeVisible();
	});
});
