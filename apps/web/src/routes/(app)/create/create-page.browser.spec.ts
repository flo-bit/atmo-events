import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { page as appPage } from '$app/state';
import {
	DESCRIPTION_WITH_GIF,
	GIF,
	embedSettled,
	gifHostRequests,
	loadButton
} from '#lib/private-events/held-embeds.fixture.js';
import '../../../app.css';
import CreatePage from './+page.svelte';

const { mocks } = vi.hoisted(() => ({
	mocks: {
		savePrivateEvent: vi.fn(async () => ({ uri: 'at://x', cid: 'cid' })),
		putRecord: vi.fn(async () => ({ uri: 'at://x', cid: 'cid' })),
		uploadBlob: vi.fn(),
		requestPermissions: vi.fn(async () => {}),
		user: {
			isLoggedIn: true,
			did: 'did:plc:hosthosthosthosthosthost',
			canPostToBluesky: false,
			profile: { handle: 'host.example.com' }
		}
	}
}));
// The page's writes go through SvelteKit remote functions, which a browser test has no server for.
vi.mock('#lib/private-events/private-events.remote', () => ({
	savePrivateEvent: mocks.savePrivateEvent,
	cancelPrivateEvent: vi.fn()
}));
vi.mock('#lib/atproto/repo.remote.js', () => ({
	putRecord: mocks.putRecord,
	createRecord: vi.fn(),
	deleteRecord: vi.fn(),
	uploadBlob: mocks.uploadBlob
}));
// Asking for a permission leaves the page, which a browser test can't follow.
vi.mock('@svelte-atproto/oauth/client', () => ({ requestPermissions: mocks.requestPermissions }));
vi.mock('#lib/atproto/auth.svelte.js', () => ({
	user: mocks.user,
	login: vi.fn(),
	logout: vi.fn(),
	signup: vi.fn(),
	authorizePreferredSocialClient: vi.fn(),
	authorizeMeetings: vi.fn()
}));

// What the editor says under each choice.
const PUBLIC_WHAT = 'Anyone can view and it appears in discovery.';
const UNLISTED_WHAT = 'Public to anyone with the link, but hidden from discovery.';
const PRIVATE_WHAT = 'Only people you invite can see it.';

/** The page's data, as its load returns it for a host with the beta on, or with it off. */
function data(privateEvents = true, hostAccess: 'ask' | 'refused' | null = null) {
	return {
		pageTitle: 'Create Event',
		actorDid: mocks.user.did,
		rkey: '3knewevent',
		privateEvents,
		hostAccess,
		spacesServer: null
	};
}

function at(search: string) {
	appPage.url = new URL(`https://atmo.rsvp/create${search}`);
}

/** An event already filled in, the way an import leaves one for the page, so a test can publish
 *  it without typing into the editor. */
function filledIn(more: { description?: string } = {}) {
	sessionStorage.setItem(
		'atmo:event-import-prefill',
		JSON.stringify({
			name: 'Dinner',
			startsAt: '2099-01-01T18:00:00.000Z',
			endsAt: '2099-01-01T20:00:00.000Z',
			timezone: 'UTC',
			...more
		})
	);
}

function choice(name: string) {
	return page.getByRole('radio', { name, exact: true });
}

const publish = () => page.getByRole('button', { name: /^publish/i });
const dialog = () => page.getByRole('dialog', { name: 'Make this event private?' });
const makePrivate = () => page.getByRole('button', { name: 'Make it private' });

/** Picks Private and says yes in the dialog. */
async function choosePrivate() {
	await choice('Private').click();
	await makePrivate().click();
	await expect.element(choice('Private')).toBeChecked();
}

/** Pastes text into the event's description, as a person would. */
async function pasteIntoDescription(text: string) {
	const description = page.getByRole('textbox', { name: /description/i });
	await description.click();
	const clipboard = new DataTransfer();
	clipboard.setData('text/plain', text);
	description
		.element()
		.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true })
		);
}

afterEach(() => {
	at('');
	sessionStorage.clear();
	mocks.savePrivateEvent.mockClear();
	mocks.putRecord.mockClear();
	mocks.uploadBlob.mockReset();
	mocks.requestPermissions.mockClear();
});

describe('choosing who can see it on /create', () => {
	it('shows the whole editor at once, with Public, Unlisted and Private under the title', async () => {
		render(CreatePage, { data: data() } as never);
		await expect.element(publish()).toBeVisible();
		await expect.element(choice('Public')).toBeChecked();
		for (const name of ['Unlisted', 'Private']) {
			await expect.element(choice(name)).not.toBeChecked();
		}
		expect(page.getByRole('radio', { name: 'Public' }).elements()).toHaveLength(1);
	});

	it.each([
		['Public', PUBLIC_WHAT],
		['Unlisted', UNLISTED_WHAT]
	])('says in one line what %s means', async (name, what) => {
		render(CreatePage, { data: data() } as never);
		await choice('Unlisted').click();
		await choice(name).click();
		await expect.element(choice(name)).toBeChecked();
		await expect.element(page.getByText(what, { exact: true })).toBeVisible();
	});

	it('asks before Private, with what it means, and keeps Public on "Keep it public"', async () => {
		render(CreatePage, { data: data() } as never);
		await choice('Private').click();
		await expect.element(dialog()).toBeVisible();
		for (const line of [
			'Private events are in beta. Use them at your own risk.',
			"A private event can't be made public later.",
			'Only people you invite by handle can see it.'
		]) {
			await expect.element(dialog().getByText(line, { exact: true })).toBeVisible();
		}
		await expect.element(choice('Public')).toBeChecked();
		await page.getByRole('button', { name: 'Keep it public' }).click();
		await expect.element(dialog()).not.toBeInTheDocument();
		await expect.element(choice('Public')).toBeChecked();
		await expect.element(choice('Private')).not.toBeChecked();
	});

	it('keeps Public when the dialog is closed with Escape, and asks again next time', async () => {
		render(CreatePage, { data: data() } as never);
		await choice('Private').click();
		await expect.element(dialog()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
		await expect.element(choice('Public')).toBeChecked();
		await choosePrivate();
	});

	it('switches to Private on "Make it private", and keeps what the host typed', async () => {
		render(CreatePage, { data: data() } as never);
		await page.getByRole('textbox', { name: 'Event name' }).click();
		await userEvent.keyboard('Dinner at Ana');
		await choosePrivate();
		await expect.element(page.getByText(PRIVATE_WHAT, { exact: true })).toBeVisible();
		await expect.element(page.getByText('Dinner at Ana')).toBeVisible();
		await choice('Public').click();
		await expect.element(choice('Public')).toBeChecked();
		await expect.element(page.getByText('Dinner at Ana')).toBeVisible();
	});

	it.each([
		['Public', true],
		['Unlisted', false]
	])('publishes an event picked as %s with that answer in its record', async (name, listed) => {
		filledIn();
		render(CreatePage, { data: data() } as never);
		await choice('Unlisted').click();
		await choice(name).click();
		await publish().click();
		await expect
			.poll(() => mocks.putRecord)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					record: expect.objectContaining({ preferences: { showInDiscovery: listed } })
				})
			);
		expect(mocks.savePrivateEvent).not.toHaveBeenCalled();
	});
});

describe('publishing a private event on /create', () => {
	it('saves it in the host’s own space, never publicly', async () => {
		filledIn();
		render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await publish().click();
		await expect
			.poll(() => mocks.savePrivateEvent)
			.toHaveBeenCalledWith(expect.objectContaining({ rkey: '3knewevent' }));
		expect(mocks.putRecord).not.toHaveBeenCalled();
	});

	it('publishes publicly when the host goes back to Public', async () => {
		filledIn();
		render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await choice('Public').click();
		await publish().click();
		await expect.poll(() => mocks.putRecord).toHaveBeenCalled();
		expect(mocks.savePrivateEvent).not.toHaveBeenCalled();
	});
});

describe('a private event’s picture on /create', () => {
	const uploaded = {
		$type: 'blob',
		ref: { $link: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku' },
		mimeType: 'image/webp',
		size: 1000
	};
	const saved = () =>
		(mocks.savePrivateEvent.mock.calls[0] as unknown as [{ record: Record<string, unknown> }])[0]
			.record;

	it('is uploaded through the host’s own sign-in and saved with the event', async () => {
		mocks.uploadBlob.mockResolvedValue(uploaded);
		filledIn();
		render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await publish().click();
		await expect.poll(() => mocks.savePrivateEvent).toHaveBeenCalled();
		expect(mocks.uploadBlob).toHaveBeenCalledTimes(1);
		expect(saved().media).toEqual([expect.objectContaining({ content: uploaded })]);
	});

	it('does not stop the event being created when the cover won’t upload', async () => {
		mocks.uploadBlob.mockRejectedValue(new Error('upload refused'));
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
		filledIn();
		render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await publish().click();
		await expect.poll(() => mocks.savePrivateEvent).toHaveBeenCalled();
		expect(mocks.uploadBlob).toHaveBeenCalledTimes(1);
		expect(saved()).not.toHaveProperty('media');
		warned.mockRestore();
	});

	it('stays private when private events turn off while it saves', async () => {
		let release: (blob: unknown) => void = () => {};
		mocks.uploadBlob.mockImplementation(() => new Promise((done) => (release = done)));
		filledIn();
		const view = await render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await publish().click();
		await expect.poll(() => mocks.uploadBlob.mock.calls.length).toBe(1);
		await view.rerender({ data: data(false) } as never);
		await expect.element(page.getByTestId('private-off')).toBeVisible();
		release(uploaded);
		await expect.poll(() => mocks.savePrivateEvent.mock.calls.length).toBe(1);
		expect(mocks.putRecord).not.toHaveBeenCalled();
	});
});

describe('a link in a private event’s description on /create', () => {
	beforeEach(() => performance.clearResourceTimings());

	it('asks nothing of a GIF host until the host loads the GIF', async () => {
		at('?audience=private');
		filledIn({ description: DESCRIPTION_WITH_GIF });
		render(CreatePage, { data: data() } as never);
		await expect.element(page.getByText('Bring snacks', { exact: false })).toBeVisible();
		await embedSettled();
		expect(gifHostRequests()).toEqual([]);
		await loadButton().click();
		await expect.poll(() => gifHostRequests()).not.toEqual([]);
	});

	it('holds a GIF added after the host chose Private', async () => {
		// A GIF of its own, so a request left over from another test can't count here.
		const pasted = GIF.replace('abc123', 'pasted1');
		render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await pasteIntoDescription(pasted);
		await expect.element(loadButton()).toBeVisible();
		expect(gifHostRequests().filter((url) => url.includes('pasted1'))).toEqual([]);
	});
});

describe('coming back from the permission step', () => {
	it('has Private picked, with the editor ready', async () => {
		at('?audience=private');
		render(CreatePage, { data: data() } as never);
		await expect.element(choice('Private')).toBeChecked();
		await expect.element(publish()).toBeVisible();
		expect(dialog().elements()).toHaveLength(0);
	});

	it('without the permission, asks again, and Private waits for it', async () => {
		at('?audience=private');
		render(CreatePage, { data: data(true, 'ask') } as never);
		await expect.element(dialog()).toBeVisible();
		await expect
			.element(dialog().getByRole('button', { name: 'Allow atmo to host private events' }))
			.toBeVisible();
		await expect.element(makePrivate()).toBeDisabled();
		await expect.element(choice('Public')).toBeChecked();
	});

	it('counts closing that dialog as a choice, so the draft stays if private events turn off', async () => {
		at('?audience=private');
		const view = await render(CreatePage, { data: data(true, 'ask') } as never);
		await expect.element(dialog()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
		await view.rerender({ data: data(false) } as never);
		await expect.element(publish()).toBeVisible();
		expect(page.getByTestId('private-off').elements()).toHaveLength(0);
	});
});

describe('asking for the permission to host on /create', () => {
	const askFirst = () => page.getByTestId('ask-first');

	it('asks above the editor before anything is typed, and comes back to /create with Private not yet picked', async () => {
		render(CreatePage, { data: data(true, 'ask') } as never);
		await expect.element(askFirst()).toBeVisible();
		await expect.element(publish()).toBeVisible();
		expect(dialog().elements()).toHaveLength(0);
		await askFirst().getByRole('button', { name: 'Allow private events' }).click();
		await expect.poll(() => mocks.requestPermissions).toHaveBeenCalledTimes(1);
		// Marked as asked by this person, so the page can say their server said no.
		expect(mocks.requestPermissions).toHaveBeenCalledWith(expect.any(Array), {
			returnTo: `/create?asked=${encodeURIComponent(mocks.user.did)}`
		});
	});

	it('says so when the ask could not start, and keeps offering it', async () => {
		mocks.requestPermissions.mockRejectedValueOnce(new Error('offline'));
		render(CreatePage, { data: data(true, 'ask') } as never);
		await askFirst().getByRole('button', { name: 'Allow private events' }).click();
		await expect.element(askFirst().getByRole('alert')).toBeVisible();
		await expect
			.element(askFirst().getByRole('button', { name: 'Allow private events' }))
			.toBeEnabled();
	});

	it('does not ask again above the editor right after the server said no', async () => {
		render(CreatePage, { data: data(true, 'refused') } as never);
		await expect.element(publish()).toBeVisible();
		expect(askFirst().elements()).toHaveLength(0);
	});

	it('has nothing to ask once atmo has the permission', async () => {
		render(CreatePage, { data: data() } as never);
		await expect.element(publish()).toBeVisible();
		expect(askFirst().elements()).toHaveLength(0);
	});
});

// Private events read as off when someone turned the beta off, or when the setting couldn't be read
// in time. The editor is then the public one, and a public post can't be taken back.
describe('a private choice, while private events are off', () => {
	it('from a link, shows no editor, only how to turn them on', async () => {
		at('?audience=private');
		render(CreatePage, { data: data(false) } as never);
		await expect.element(page.getByTestId('private-off')).toBeVisible();
		await expect
			.element(page.getByTestId('private-off').getByRole('link', { name: 'Settings' }))
			.toHaveAttribute('href', '/settings');
		expect(publish().elements()).toHaveLength(0);
		expect(page.getByRole('radio').elements()).toHaveLength(0);
	});

	it('gives a draft chosen as Private no editor when private events turn off mid-edit', async () => {
		const view = await render(CreatePage, { data: data() } as never);
		await choosePrivate();
		await view.rerender({ data: data(false) } as never);
		await expect.poll(() => publish().elements()).toHaveLength(0);
		await expect.element(page.getByTestId('private-off')).toBeVisible();
	});

	it('publishes a draft chosen as Unlisted unlisted when private events turn off mid-edit', async () => {
		filledIn();
		const view = await render(CreatePage, { data: data() } as never);
		await choice('Unlisted').click();
		await expect.element(choice('Unlisted')).toBeChecked();
		await view.rerender({ data: data(false) } as never);
		await expect.poll(() => choice('Private').elements()).toHaveLength(0);
		await publish().click();
		await expect
			.poll(() => mocks.putRecord)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					record: expect.objectContaining({ preferences: { showInDiscovery: false } })
				})
			);
	});

	it('leaves a plain /create as it was: the editor, with Public and Unlisted only', async () => {
		render(CreatePage, { data: data(false) } as never);
		await expect.element(publish()).toBeVisible();
		expect(page.getByTestId('private-off').elements()).toHaveLength(0);
		await expect.element(choice('Unlisted')).toBeVisible();
		expect(choice('Private').elements()).toHaveLength(0);
	});
});
