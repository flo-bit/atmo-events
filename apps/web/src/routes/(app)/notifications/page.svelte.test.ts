import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

vi.mock('#lib/atproto/auth.svelte.js', () => ({ user: { isLoggedIn: true } }));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));

it('server-renders a populated inbox and its read and pagination controls before hydration', () => {
	const now = Date.UTC(2026, 10, 11, 12);
	const { body } = render(Page, {
		props: {
			params: {},
			form: null,
			data: {
				did: 'did:plc:test',
				profile: null,
				canPostToBluesky: false,
				isModerator: false,
				now,
				pageTitle: 'Notifications',
				inbox: {
					items: [
						{
							id: '1',
							recipient: 'did:plc:test',
							category: 'change',
							key: 'event-edited',
							title: 'Evening walk changed',
							body: null,
							uri: '/events',
							subject: null,
							createdAt: now,
							sendAt: now,
							readAt: null,
							actors: []
						}
					],
					cursor: 'next',
					unread: 1
				}
			}
		}
	});
	expect(body).toContain('Evening walk changed');
	expect(body).toContain('Mark all read');
	expect(body).toContain('Show more');
	expect(body).not.toContain('No notifications yet.');
});
