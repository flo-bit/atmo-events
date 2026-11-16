import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { eventUri, singleEvent } from '#lib/private-events/ids.js';
import '../../../../../../app.css';
import EventPage from './+page.svelte';

// Hoisted with the mocks, which run before the rest of the file.
const { HOST, GUEST, mocks } = vi.hoisted(() => {
	const GUEST = 'did:plc:guestguestguestguestguest';
	return {
		HOST: 'did:plc:hosthosthosthosthosthost',
		GUEST,
		mocks: {
			rsvp: vi.fn(async () => ({})),
			// Signed in as the guest unless a test signs in as the host.
			user: { isLoggedIn: true, did: GUEST, profile: { handle: 'guest.example.com' } }
		}
	};
});
// The page's writes go through SvelteKit remote functions, which a browser test has no server for.
vi.mock('#lib/private-events/private-events.remote', () => ({
	rsvpToPrivateEvent: mocks.rsvp,
	cancelPrivateRsvp: vi.fn(),
	addGuest: vi.fn(),
	removeGuest: vi.fn(),
	// The beta switch, off, for the offer a guest sees once they answer.
	getPrivateEventsBeta: () => ({ ready: true, current: { canSave: true, on: false } }),
	setPrivateEventsBeta: vi.fn()
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

const ADDRESS = {
	$type: 'community.lexicon.location.address',
	street: '12 Secret Lane',
	locality: 'Louisville',
	country: 'US'
};

/** A guest's view of the event, as the page's load returns it. */
function guestView() {
	return {
		pageTitle: 'Dinner',
		did: GUEST,
		view: 'event',
		eventData: {
			name: 'Dinner',
			startsAt: '2030-01-01T18:00:00Z',
			createdAt: '2029-01-01T00:00:00Z',
			did: HOST,
			rkey: '3kabc',
			uri: eventUri(singleEvent(HOST, '3kabc')),
			cid: 'cid',
			locations: [ADDRESS]
		},
		description: null,
		actorDid: HOST,
		rkey: '3kabc',
		hostProfile: { did: HOST, handle: 'host.example.com' },
		attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 },
		answersUnread: false,
		viewerRsvpStatus: null,
		viewerRsvpRkey: null,
		loggedIn: true,
		guests: null
	};
}

/** What the page asks for with fetch, which is how a geocoding lookup goes. */
function watchRequests() {
	const seen: string[] = [];
	vi.stubGlobal('fetch', async (input: unknown) => {
		seen.push(String(input));
		return Response.json([]);
	});
	return () => seen;
}

/** A description with a Klipy GIF alone on its line, as the page's load parses it (parseRichText's
 *  output); a link alone on its line is the kind that shows as an embed. */
const GIF = 'https://static.klipy.com/ii/abc123/def456.gif';
const WITH_GIF = {
	version: 1,
	markdown: true,
	children: [
		{ type: 'paragraph', children: [{ type: 'text', value: 'Bring snacks' }] },
		{
			type: 'paragraph',
			children: [{ type: 'link', url: GIF, children: [{ type: 'text', value: GIF }] }]
		}
	]
};

/** Anything the page asked the GIF host for: a fetch, or a media element pointing there. */
function gifHostRequests(seen: string[]): string[] {
	const media = [...document.querySelectorAll('[src]')].map((e) => e.getAttribute('src') ?? '');
	const loaded = performance.getEntriesByType('resource').map((e) => e.name);
	return [...seen, ...media, ...loaded].filter((url) => /klipy\.com|k\.gifs\.bsky\.app/.test(url));
}

afterEach(() => {
	vi.unstubAllGlobals();
	mocks.user.did = GUEST;
});

/** The host's view of their single event, with one guest. */
function hostView() {
	return {
		...guestView(),
		isHost: true,
		guests: [{ did: GUEST, handle: 'guest.example.com', answer: 'going', answerUnread: false }],
		guestsCapped: false
	};
}

describe('a private event’s page', () => {
	it('shows a guest the address and looks up its place, as for any event', async () => {
		const requests = watchRequests();
		render(EventPage, { data: guestView() } as never);
		await expect.element(page.getByText('12 Secret Lane', { exact: false }).first()).toBeVisible();
		await expect
			.poll(() => requests().filter((url) => url.includes('/api/geocoding')))
			.toHaveLength(1);
	});

	it('asks a guest who answers Going to share nothing', async () => {
		watchRequests();
		render(EventPage, { data: guestView() } as never);
		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect
			.poll(() => mocks.rsvp)
			.toHaveBeenCalledWith(
				expect.objectContaining({ host: HOST, rkey: '3kabc', status: 'going' })
			);
		await expect.element(page.getByText("You're Going", { exact: true })).toBeVisible();
		expect(page.getByText("You're going!", { exact: true }).elements()).toHaveLength(0);
	});

	it('offers a guest who answers, with the beta off, a way to find it again', async () => {
		watchRequests();
		render(EventPage, { data: guestView() } as never);
		expect(page.getByTestId('find-again').elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Going', exact: true }).click();
		const shown = (id: string) =>
			(page.getByTestId(id).elements()[0]?.textContent ?? '').replace(/\s+/g, ' ');
		await expect
			.poll(() => shown('find-again'))
			.toContain('Turn on private events to find this again in Your events, on the home page.');
		expect(shown('private-note')).not.toContain('Answer to let the host know');
	});

	it('sends its host to the private event’s own editor, not the public one', async () => {
		watchRequests();
		mocks.user.did = HOST;
		render(EventPage, { data: guestView() } as never);
		await expect
			.element(page.getByRole('link', { name: 'Edit Event' }))
			.toHaveAttribute('href', '/p/host.example.com/private/3kabc/edit');
	});

	it('asks nothing of a GIF host when it opens, and offers to load the GIF', async () => {
		const requests = watchRequests();
		const view = guestView();
		render(EventPage, {
			data: {
				...view,
				eventData: { ...view.eventData, description: `Bring snacks\n\n${GIF}` },
				description: WITH_GIF
			}
		} as never);
		await expect.element(page.getByText('Bring snacks', { exact: false })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^Load / })).toBeVisible();
		expect(gifHostRequests(requests())).toEqual([]);
	});
});

describe('a private event’s page, for its host', () => {
	it('shows the guest list', async () => {
		watchRequests();
		mocks.user.did = HOST;
		render(EventPage, { data: hostView() } as never);
		await expect.element(page.getByTestId('guest-list')).toBeVisible();
	});
});
