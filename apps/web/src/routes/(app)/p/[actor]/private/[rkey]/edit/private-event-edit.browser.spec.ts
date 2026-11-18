import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { eventUri, singleEvent } from '#lib/private-events/ids.js';
import {
	DESCRIPTION_WITH_GIF,
	embedSettled,
	gifHostRequests,
	loadButton
} from '#lib/private-events/held-embeds.fixture.js';
import '../../../../../../../app.css';
import EditPage from './+page.svelte';

const { HOST, mocks } = vi.hoisted(() => {
	const HOST = 'did:plc:hosthosthosthosthosthost';
	return {
		HOST,
		mocks: {
			user: {
				isLoggedIn: true,
				did: HOST,
				canPostToBluesky: false,
				profile: { handle: 'host.example.com' }
			}
		}
	};
});
// The page's writes go through SvelteKit remote functions, which a browser test has no server for.
vi.mock('#lib/private-events/private-events.remote', () => ({
	savePrivateEvent: vi.fn(),
	cancelPrivateEvent: vi.fn()
}));
vi.mock('#lib/atproto/repo.remote.js', () => ({
	putRecord: vi.fn(),
	createRecord: vi.fn(),
	deleteRecord: vi.fn(),
	uploadBlob: vi.fn()
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({
	user: mocks.user,
	login: vi.fn(),
	logout: vi.fn(),
	signup: vi.fn(),
	authorizePreferredSocialClient: vi.fn(),
	authorizeMeetings: vi.fn()
}));

const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const PICTURE = {
	role: 'thumbnail',
	content: { $type: 'blob', ref: { $link: CID }, mimeType: 'image/png', size: 10 }
};

/** The host's event, as the edit page's load returns it. */
function editView(more: Record<string, unknown> = {}) {
	return {
		eventData: {
			...more,
			name: 'Dinner',
			description: DESCRIPTION_WITH_GIF,
			startsAt: '2099-01-01T18:00:00Z',
			createdAt: '2029-01-01T00:00:00Z',
			did: HOST,
			rkey: '3kabc',
			uri: eventUri(singleEvent(HOST, '3kabc')),
			cid: 'cid'
		},
		actorDid: HOST,
		rkey: '3kabc'
	};
}

describe('editing a private event', () => {
	it('asks nothing of a GIF host until the host loads the GIF', async () => {
		render(EditPage, { data: editView() } as never);
		await expect.element(page.getByText('Bring snacks', { exact: false })).toBeVisible();
		await embedSettled();
		expect(gifHostRequests()).toEqual([]);
		await loadButton().click();
		await expect.poll(() => gifHostRequests()).not.toEqual([]);
	});

	it('offers a picture, and shows the one it has from atmo’s own route', async () => {
		render(EditPage, { data: editView({ media: [PICTURE] }) } as never);
		await expect
			.poll(() => document.querySelectorAll('input[type=file]').length)
			.toBeGreaterThan(0);
		const route = `/p/${encodeURIComponent(HOST)}/private/3kabc/picture/${CID}`;
		await expect
			.poll(() => [...document.querySelectorAll('img')].map((img) => img.getAttribute('src')))
			.toContain(route);
		const sources = [...document.querySelectorAll('img')].map((img) => img.src);
		expect(sources.filter((src) => src.includes('cdn.bsky.app'))).toEqual([]);
	});
});
