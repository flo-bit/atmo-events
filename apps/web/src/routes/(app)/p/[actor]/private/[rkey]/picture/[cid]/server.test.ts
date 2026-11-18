import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpaceAccessDenied } from '#lib/spaces/server/space-credential.js';
import { EVENT_COLLECTION, privateEventSpace } from '#lib/private-events/ids.js';
import { GUEST_SCOPE, HOST_SCOPE } from '#lib/private-events/scopes.js';

// Who gets a private event's picture, and how it is served.
const HOST = 'did:plc:hosthosthosthosthosthost';
const GUEST = 'did:plc:guestguestguestguestgues';
const RKEY = '3levent';
const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const BYTES = new Uint8Array([137, 80, 78, 71]);
const picture = (mimeType = 'image/png', cid = CID) => ({
	role: 'thumbnail',
	content: { $type: 'blob', ref: { $link: cid }, mimeType, size: BYTES.length }
});

const enabled = vi.hoisted(() => ({ value: true }));
const reader = { get: vi.fn(), writers: vi.fn(), blob: vi.fn() };
vi.mock('#lib/spaces/server/space-read.js', () => ({ credentialSpaceReader: () => reader }));
vi.mock('#lib/actor.js', () => ({
	getActor: async (actor: string) => (actor === 'no-one.example.com' ? null : actor),
	actorToDid: vi.fn()
}));
vi.mock('#lib/private-events/server/people.js', () => ({ verifiedHandle: async () => null }));
vi.mock('#lib/private-events/server/enabled.js', () => ({
	privateEventsEnabled: () => enabled.value,
	spacesServer: () => null
}));

const { GET } = await import('./+server');

function request(
	did: string | null,
	scope: string,
	params: { actor?: string; rkey?: string; cid?: string } = {}
) {
	const session = did && { did, getTokenInfo: async () => ({ scope }) };
	return {
		params: { actor: HOST, rkey: RKEY, cid: CID, ...params },
		locals: { session }
	} as never;
}
const guest = (params = {}) => request(GUEST, GUEST_SCOPE, params);

/** The host's space under the event's key holds the event with this media. */
function theEventCites(media: unknown[]) {
	const space = privateEventSpace(HOST, RKEY);
	reader.get.mockImplementation(async (q: { space: string; repo: string; collection: string }) => {
		if (q.space !== space || q.repo !== HOST || q.collection !== EVENT_COLLECTION) return null;
		const value = {
			$type: EVENT_COLLECTION,
			name: 'Dinner',
			createdAt: '2026-11-01T00:00:00.000Z',
			startsAt: '2099-01-01T18:00:00.000Z',
			media
		};
		return { uri: `${space}/${HOST}/${EVENT_COLLECTION}/${RKEY}`, cid: 'cid', rkey: RKEY, value };
	});
}

async function answer(res: Response) {
	return {
		status: res.status,
		body: new Uint8Array(await res.arrayBuffer()),
		headers: Object.fromEntries(res.headers)
	};
}

beforeEach(() => {
	enabled.value = true;
	reader.get.mockReset();
	reader.blob.mockReset();
	reader.blob.mockResolvedValue(BYTES);
	theEventCites([picture()]);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('a picture the event cites', () => {
	it('is served to a guest, as the image type the record gives, kept out of shared caches', async () => {
		const served = await answer(await GET(guest()));
		expect(served.status).toBe(200);
		expect(served.body).toEqual(BYTES);
		expect(served.headers).toMatchObject({
			'content-type': 'image/png',
			'cache-control': 'private, max-age=300',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox"
		});
		expect(reader.blob).toHaveBeenCalledWith(
			{ space: privateEventSpace(HOST, RKEY), repo: HOST, cid: CID },
			expect.any(Number)
		);
	});

	it('is served to the host', async () => {
		expect((await GET(request(HOST, HOST_SCOPE))).status).toBe(200);
	});
});

describe('what no one can tell apart', () => {
	const cases: [string, () => unknown][] = [
		['someone signed out', () => request(null, '')],
		['someone without the grant', () => request(GUEST, 'atmo')],
		[
			'someone not on the list',
			() => {
				reader.get.mockRejectedValue(new SpaceAccessDenied('space', '400 SpaceNotFound'));
				return guest();
			}
		],
		[
			'an event that is not there',
			() => {
				reader.get.mockResolvedValue(null);
				return guest();
			}
		],
		['an actor that names no one', () => guest({ actor: 'no-one.example.com' })],
		[
			'a CID the event does not cite',
			() => guest({ cid: 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
		],
		['something that is not a CID', () => guest({ cid: '..%2F..%2Fxrpc' })],
		[
			'a picture cited as a type that is not served',
			() => {
				theEventCites([picture('image/svg+xml')]);
				return guest();
			}
		],
		[
			'a blob the host does not have, or that is too large',
			() => {
				reader.blob.mockResolvedValue(null);
				return guest();
			}
		],
		[
			'private events turned off',
			() => {
				enabled.value = false;
				return guest();
			}
		]
	];

	it.each(cases)('%s gets the same answer as a made-up address', async (_, asked) => {
		const made = await answer(await GET(guest({ rkey: '3lmadeup' })));
		expect(made.status).toBe(404);
		expect(await answer(await GET(asked() as never))).toEqual(made);
	});

	it('reads no blob for a CID the event does not cite', async () => {
		await GET(guest({ cid: 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }));
		expect(reader.blob).not.toHaveBeenCalled();
	});

	it('is never cached, so someone just added sees it at once', async () => {
		expect((await GET(guest({ rkey: '3lmadeup' }))).headers.get('cache-control')).toBe('no-store');
	});
});

describe('a picture that could not be read', () => {
	it('is not passed off as not there', async () => {
		reader.blob.mockRejectedValue(new Error('500'));
		expect((await GET(guest())).status).toBe(503);
	});

	it('is logged without whose picture it is, whose event or which picture', async () => {
		reader.get.mockRejectedValue(
			new Error(`getRecord at ${privateEventSpace(HOST, RKEY)} for ${GUEST} of ${CID}`)
		);
		await GET(guest());
		const logs = [console.error, console.warn, console.info]
			.flatMap((log) => vi.mocked(log).mock.calls.flat().map(String))
			.join('\n');
		expect(logs.length).toBeGreaterThan(0);
		for (const named of [HOST, GUEST, RKEY, CID]) expect(logs).not.toContain(named);
	});
});
