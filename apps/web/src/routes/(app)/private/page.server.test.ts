import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_COLLECTION, privateEventSpace } from '#lib/private-events/ids.js';
import { GUEST_SCOPE } from '#lib/private-events/scopes.js';

const setHeaders = vi.fn();
const reader = { get: vi.fn(), list: vi.fn(), writers: vi.fn() };
vi.mock('#lib/spaces/server/space-read.js', () => ({ credentialSpaceReader: () => reader }));
vi.mock('#lib/actor.js', () => ({ actorToDid: vi.fn() }));
vi.mock('#lib/private-events/server/people.js', () => ({
	verifiedHandle: async (did: string) => `${did.split(':').at(-1)}.example.com`
}));
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: () => true,
	spacesServer: () => null
}));

const { load } = await import('./+page.server');
const { default: PrivatePage } = await import('./+page.svelte');

const GUEST = 'did:plc:guestguestguestguestgues';
const HOST = 'did:plc:hosthosthosthosthosthost';
const SOUND = privateEventSpace(HOST, '3laaaaaaaaaaa');
const BROKEN = privateEventSpace(HOST, '3lbbbbbbbbbbb');
const RECORD = {
	$type: EVENT_COLLECTION,
	name: 'Dinner',
	createdAt: '2026-11-04T00:00:00.000Z',
	startsAt: '2026-11-07T00:00:00.000Z'
};

/** A guest of both events, signed in, whose PDS lists both spaces. */
async function renderedPrivatePage() {
	const session = {
		did: GUEST,
		getTokenInfo: async () => ({ scope: GUEST_SCOPE }),
		handle: async () => Response.json({ spaces: [{ uri: SOUND }, { uri: BROKEN }] })
	};
	const data = await load({
		locals: { session },
		cookies: { get: () => undefined, delete: () => {} },
		setHeaders
	} as never);
	return render(PrivatePage, { props: { data } as never }).body;
}

beforeEach(() => {
	reader.get.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('what a browser or cache keeps', () => {
	it('keeps no copy of the list', async () => {
		reader.get.mockResolvedValue(null);
		await renderedPrivatePage();
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store' });
	});
});

describe('/private when a host’s server is down', () => {
	it('does not say there are none', async () => {
		reader.get.mockRejectedValue(new Error('503'));
		const body = await renderedPrivatePage();
		expect(body).not.toContain('None yet');
		expect(body).toContain('data-testid="private-events-incomplete"');
	});

	it('shows what it could read, and says there may be more', async () => {
		reader.get.mockImplementation(async ({ space, rkey }: { space: string; rkey: string }) => {
			if (space === BROKEN) throw new Error('503');
			return {
				uri: `${space}/${HOST}/${EVENT_COLLECTION}/${rkey}`,
				cid: `cid-of-${rkey}`,
				collection: EVENT_COLLECTION,
				rkey,
				value: RECORD
			};
		});
		const body = await renderedPrivatePage();
		expect(body).toContain('Dinner');
		expect(body).toContain('data-testid="private-events-incomplete"');
	});

	it('says nothing of the kind when all is read', async () => {
		reader.get.mockImplementation(async ({ space, rkey }: { space: string; rkey: string }) => ({
			uri: `${space}/${HOST}/${EVENT_COLLECTION}/${rkey}`,
			cid: `cid-of-${rkey}`,
			collection: EVENT_COLLECTION,
			rkey,
			value: RECORD
		}));
		const body = await renderedPrivatePage();
		expect(body).not.toContain('data-testid="private-events-incomplete"');
	});
});

describe('/private with a record a host wrote badly', () => {
	it.each([
		['a mode that is not a string', { mode: 7 }],
		['a name that is not a string', { name: 7 }],
		['a start that is not a date', { startsAt: 'soon' }]
	])('still renders for their guest, without it: %s', async (_, broken) => {
		reader.get.mockImplementation(async ({ space, rkey }: { space: string; rkey: string }) => ({
			uri: `${space}/${HOST}/${EVENT_COLLECTION}/${rkey}`,
			cid: `cid-of-${rkey}`,
			collection: EVENT_COLLECTION,
			rkey,
			value: space === BROKEN ? { ...RECORD, name: 'Broken', ...broken } : RECORD
		}));

		const body = await renderedPrivatePage();

		expect(body).toContain('Dinner');
		expect(body).not.toContain('Broken');
		expect(body.match(/\/private\/3l[a-z]+/g)).toEqual(['/private/3laaaaaaaaaaa']);
	});
});
