import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { EventView } from '@atmo-dev/kit/events';
import '../../../app.css';

const HOST = 'did:plc:hosthosthosthosthosthost';
const ADDRESS = {
	$type: 'community.lexicon.location.address',
	street: '12 Secret Lane',
	locality: 'Louisville',
	country: 'US'
};
const COORDINATES = {
	$type: 'community.lexicon.location.geo',
	latitude: '38.25',
	longitude: '-85.75',
	name: 'The back garden'
};

const viewer = { isLoggedIn: true, canPostToBluesky: false, did: 'did:plc:guest', handle: 'guest' };
const adapter = {
	features: { delete: false, recurring: false, images: false, visibility: false },
	requestLogin: () => {},
	onSaved: () => {},
	notifyUpdate: async () => {}
};

function eventPage(locations: unknown[], shareable: boolean) {
	const data = {
		eventData: {
			name: 'Dinner',
			startsAt: '2030-01-01T18:00:00Z',
			createdAt: '2029-01-01T00:00:00Z',
			did: HOST,
			rkey: '3kabc',
			uri: `at://${HOST}/community.lexicon.calendar.event/3kabc`,
			cid: 'cid',
			locations
		},
		actorDid: HOST,
		rkey: '3kabc',
		hostProfile: { did: HOST, handle: 'host.example.com' },
		attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 },
		viewerRsvpStatus: null,
		viewerRsvpRkey: null,
		eventUri: `at://${HOST}/space/x/3kabc`,
		shareable,
		loggedIn: true
	};
	return render(EventView, {
		data,
		adapter,
		viewer,
		pageUrl: new URL('https://atmo.example.com/p/host/private/3kabc')
	} as never);
}

/** What the page asks for with fetch, which is how the geocoding lookup goes. */
function watchRequests() {
	const seen: string[] = [];
	vi.stubGlobal('fetch', async (input: unknown) => {
		seen.push(String(input));
		return Response.json([]);
	});
	return () => seen;
}

afterEach(() => vi.unstubAllGlobals());

describe('where an event is', () => {
	it('is looked up for a public event, so this spec would see a lookup', async () => {
		const requests = watchRequests();
		await eventPage([ADDRESS], true);
		await expect
			.poll(() => requests().filter((url) => url.includes('/api/geocoding')))
			.toHaveLength(1);
	});

	it('leaves a private event’s address in the browser', async () => {
		const requests = watchRequests();
		await eventPage([ADDRESS], false);
		await expect.element(page.getByText('12 Secret Lane', { exact: false }).first()).toBeVisible();
		await new Promise((settled) => setTimeout(settled, 200));
		expect(requests().filter((url) => url.includes('Secret') || url.includes('geocoding'))).toEqual(
			[]
		);
	});

	it('shows no map of a private event’s place, whose tiles would say where it is', async () => {
		watchRequests();
		await eventPage([COORDINATES], false);
		await expect.element(page.getByText('The back garden').first()).toBeVisible();
		await new Promise((settled) => setTimeout(settled, 200));
		expect(page.getByText('Location:').elements()).toHaveLength(0);
	});
});
