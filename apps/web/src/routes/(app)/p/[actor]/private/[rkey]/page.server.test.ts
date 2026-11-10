import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_COLLECTION, privateEventPath, privateEventSpace } from '#lib/private-events/ids.js';
import { HOST_SCOPE } from '#lib/private-events/scopes.js';

const HOST = 'did:plc:hosthosthosthosthosthost';
const GUEST = 'did:plc:guestguestguestguestgues';
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
const reader = { get: vi.fn(), writers: vi.fn() };
const credentialSpaceReader = vi.fn(() => reader);
vi.mock('#lib/spaces/server/space-read.js', () => ({
	credentialSpaceReader: () => credentialSpaceReader()
}));
vi.mock('#lib/actor.js', () => ({ getActor: async (actor: string) => actor, actorToDid: vi.fn() }));
const publicProfile = vi.fn<(did: string) => Promise<Record<string, unknown> | null>>(
	async () => null
);
vi.mock('#lib/private-events/server/people.js', () => ({
	verifiedHandle: async (did: string) => `${did.split(':').at(-1)}.example.com`,
	publicProfiles: async (dids: string[]) => {
		const found = await Promise.all(
			dids.map(async (did) => [did, await publicProfile(did)] as const)
		);
		return new Map(found.filter(([, profile]) => profile !== null));
	}
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
const page = (data: unknown) => render(EventPage, { props: { data } as never }).body;

/** The host's space holds this event and nothing else. */
function spaceHolds(value: Record<string, unknown>) {
	return async ({ collection }: { collection: string }) =>
		collection === EVENT_COLLECTION
			? {
					uri: `${privateEventSpace(HOST, RKEY)}/${HOST}/${EVENT_COLLECTION}/${RKEY}`,
					cid: 'cid',
					collection,
					rkey: RKEY,
					value
				}
			: null;
}

beforeEach(() => {
	publicProfile.mockReset();
	publicProfile.mockResolvedValue(null);
	credentialSpaceReader.mockClear();
	reader.get.mockReset();
	reader.writers.mockReset();
	reader.writers.mockResolvedValue([]);
	reader.get.mockImplementation(spaceHolds(RECORD));
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a description written in Markdown', () => {
	it('is formatted the way a public event page formats it, with HTML kept as text', async () => {
		const description = '## Plan\n\nBring **snacks** <script>x</script>';
		reader.get.mockImplementation(spaceHolds({ ...RECORD, description }));
		const data = await load(
			request(HOST, HOST_SCOPE, browser(), `https://atmo.example.com${PATH}`, { members: [] })
		);
		const body = page(data).replace(/<!--.*?-->/g, '');
		expect(body).toMatch(/<h3[^>]*>Plan<\/h3>/);
		expect(body).toMatch(/<strong[^>]*>snacks<\/strong>/);
		expect(body).not.toContain('**snacks**');
		expect(body).toContain('&lt;script>x&lt;/script>');
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

describe('a private event’s page, to search engines', () => {
	it.each([
		['event', () => request(HOST, HOST_SCOPE, browser(), undefined, { members: [] })],
		['signed-out', () => request(null, '', browser())],
		['grant', () => request(GUEST, 'atproto', browser())]
	])('asks not to be indexed in its %s view', async (view, asked) => {
		const data = await load(asked());
		expect(data).toMatchObject({ view });
		const { head } = render(EventPage, { props: { data } as never });
		expect(head).toMatch(/<meta name="robots" content="noindex"/);
	});
});

describe('the host', () => {
	it('shows by their public name and avatar, as on a public event', async () => {
		publicProfile.mockImplementation(async (did) =>
			did === HOST
				? { displayName: 'Host Person', avatar: { ref: { $link: 'bafkreihost' } } }
				: null
		);
		reader.get.mockImplementation(spaceHolds(RECORD));
		const data = await load(
			request(HOST, HOST_SCOPE, browser(), `https://atmo.example.com${PATH}`, { members: [] })
		);

		expect(data.hostProfile).toMatchObject({
			displayName: 'Host Person',
			avatar: expect.stringContaining(`${HOST}/bafkreihost`)
		});
		expect(page(data)).toContain('Host Person');
	});
});
