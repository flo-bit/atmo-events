import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_COLLECTION, privateEventPath, privateEventSpace } from '#lib/private-events/ids.js';
import { GUEST_SCOPE, HOST_SCOPE } from '#lib/private-events/scopes.js';

const HOST = 'did:plc:hosthosthosthosthosthost';
const GUEST = 'did:plc:guestguestguestguestgues';
const OTHER = 'did:plc:otherotherotherotherothe';
const RKEY = '3lzzzzzzzzzzz';
const PATH = privateEventPath(HOST, RKEY);
const NAME = 'Dinner at the secret place';
const RECORD = {
	$type: EVENT_COLLECTION,
	name: NAME,
	createdAt: '2026-11-04T00:00:00.000Z',
	startsAt: '2026-11-07T00:00:00.000Z'
};

const setHeaders = vi.fn();
const reader = { get: vi.fn(), list: vi.fn(), writers: vi.fn() };
const credentialSpaceReader = vi.fn(() => reader);
vi.mock('#lib/spaces/server/space-read.js', () => ({
	credentialSpaceReader: () => credentialSpaceReader()
}));
vi.mock('#lib/actor.js', () => ({ getActor: async (actor: string) => actor, actorToDid: vi.fn() }));
vi.mock('#lib/private-events/server/people.js', () => ({
	verifiedHandle: async (did: string) => `${did.split(':').at(-1)}.example.com`
}));
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: () => true,
	spacesServer: () => null
}));
vi.mock('#lib/private-events/private-events.remote', () => ({
	addGuest: vi.fn(),
	removeGuest: vi.fn(),
	rsvpToPrivateEvent: vi.fn(),
	cancelPrivateRsvp: vi.fn()
}));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user: { isLoggedIn: true, did: GUEST } }));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));
vi.mock('$app/state', () => ({ page: { url: new URL(`https://atmo.example.com${PATH}`) } }));

const route = await import('./+page.server');
const { default: EventPage } = await import('./+page.svelte');

/** The browser's cookies, which outlive a request. */
function browser() {
	const jar = new Map<string, string>();
	return {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name),
		size: () => jar.size
	};
}

function request(
	did: string | null,
	scope: string,
	cookies: ReturnType<typeof browser>,
	url = `https://atmo.example.com${PATH}`,
	answers: Record<string, unknown> = {}
) {
	const session = did && {
		did,
		getTokenInfo: async () => ({ scope }),
		handle: async () => Response.json(answers)
	};
	return {
		params: { actor: HOST, rkey: RKEY },
		locals: { session },
		cookies,
		url: new URL(url),
		setHeaders
	} as never;
}

const load = (event: never) => route.load(event) as Promise<Record<string, unknown>>;
const open = (event: never) =>
	(route as unknown as { actions: { open(e: never): Promise<unknown> } }).actions.open(event);
const page = (data: unknown) => render(EventPage, { props: { data } as never }).body;

beforeEach(() => {
	credentialSpaceReader.mockClear();
	reader.get.mockReset();
	reader.writers.mockReset();
	reader.writers.mockResolvedValue([]);
	reader.get.mockImplementation(async ({ collection }: { collection: string }) =>
		collection === EVENT_COLLECTION
			? {
					uri: `${privateEventSpace(HOST, RKEY)}/${HOST}/${EVENT_COLLECTION}/${RKEY}`,
					cid: 'cid',
					collection,
					rkey: RKEY,
					value: RECORD
				}
			: null
	);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('opening a private event', () => {
	it('asks a guest first, and contacts nothing until they do', async () => {
		const data = await load(request(GUEST, GUEST_SCOPE, browser()));
		expect(data.view).toBe('open');
		expect(credentialSpaceReader).not.toHaveBeenCalled();
		const body = page(data);
		expect(body).toContain('action="?/open"');
		expect(body).toMatch(/method="POST"/i);
		expect(body).not.toContain(NAME);
	});

	it('reads it once they click, and on later visits from that browser', async () => {
		const cookies = browser();
		await expect(open(request(GUEST, GUEST_SCOPE, cookies))).rejects.toMatchObject({
			status: 303,
			location: PATH
		});
		expect(credentialSpaceReader).not.toHaveBeenCalled();

		expect((await load(request(GUEST, GUEST_SCOPE, cookies))).view).toBe('event');
		expect((await load(request(GUEST, GUEST_SCOPE, cookies))).view).toBe('event');
	});

	it('does not take a link as the click', async () => {
		const data = await load(
			request(GUEST, GUEST_SCOPE, browser(), `https://atmo.example.com${PATH}?/open&open=1`)
		);
		expect(data.view).toBe('open');
		expect(credentialSpaceReader).not.toHaveBeenCalled();
	});

	it('asks again for someone else on the same browser', async () => {
		const cookies = browser();
		await open(request(GUEST, GUEST_SCOPE, cookies)).catch(() => {});
		expect((await load(request(OTHER, GUEST_SCOPE, cookies))).view).toBe('open');
		expect(credentialSpaceReader).not.toHaveBeenCalled();
	});

	it('remembers nothing for someone signed out', async () => {
		const cookies = browser();
		await open(request(null, '', cookies)).catch(() => {});
		expect(cookies.size()).toBe(0);
	});

	it('does not ask the host, whose own server it is', async () => {
		const answers = { members: [] };
		const data = await load(
			request(HOST, HOST_SCOPE, browser(), `https://atmo.example.com${PATH}`, answers)
		);
		expect(data.view).toBe('event');
	});
});

describe('what a browser or cache keeps', () => {
	it('keeps no copy of a private page', async () => {
		setHeaders.mockClear();
		const cookies = browser();
		await open(request(GUEST, GUEST_SCOPE, cookies)).catch(() => {});
		await load(request(GUEST, GUEST_SCOPE, cookies));
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store' });
	});
});

describe('a host whose guests’ answers could not be read', () => {
	it('is told so, rather than that nobody has answered', async () => {
		reader.writers.mockRejectedValue(new Error('503'));
		const answers = { members: [{ did: GUEST }] };
		const data = await load(
			request(HOST, HOST_SCOPE, browser(), `https://atmo.example.com${PATH}`, answers)
		);
		const body = page(data);
		expect(body).toContain('data-testid="answers-unread"');
		expect(body).not.toContain('hasn&#39;t answered');
		expect(body).not.toContain("hasn't answered");
	});
});
