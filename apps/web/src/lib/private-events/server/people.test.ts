import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSpaceLookups } from '#lib/spaces/server/space-credential.js';
import { HOST_SCOPE } from '../scopes';
import { addGuest, PrivateEventRefused } from './events';
import { verifiedHandle } from './people';

// The network object keeps the fetch it is made with, and these tests stub a new one each time.
vi.mock('#lib/atproto/network.js', async () => {
	const { createAtprotoNetwork } = await import('@svelte-atproto/oauth/network');
	const standard = createAtprotoNetwork({ fetch: (input, init) => globalThis.fetch(input, init) });
	return { atprotoNetwork: () => standard };
});

const DID = 'did:web:someone.test';
const HANDLE = 'someone.test';

const didDocument = () =>
	Response.json({
		'@context': ['https://www.w3.org/ns/did/v1'],
		id: DID,
		alsoKnownAs: [`at://${HANDLE}`],
		service: [
			{
				id: '#atproto_pds',
				type: 'AtprotoPersonalDataServer',
				serviceEndpoint: 'https://pds.someone.test'
			}
		]
	});

/** Never answers, and stops when told to, as a real fetch does. */
const neverAnswers = (_input: unknown, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
	});

/** Answers for a person's DID document and for the DID their handle points at. */
function people(pointsAt: string) {
	vi.stubGlobal('fetch', async (input: URL | string) => {
		const url = new URL(String(input));
		if (url.pathname === '/.well-known/did.json') return didDocument();
		if (url.pathname === '/.well-known/atproto-did') return new Response(pointsAt);
		return Response.json({ Status: 0, Answer: [] });
	});
}

/** The time limit, short enough for a test to wait it out. */
function shortLimit() {
	const realTimeout = AbortSignal.timeout.bind(AbortSignal);
	vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
}

beforeEach(() => {
	clearSpaceLookups();
	vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('verifiedHandle', () => {
	it('gives the handle that points back at the DID', async () => {
		people(DID);
		expect(await verifiedHandle(DID)).toBe(HANDLE);
	});

	it('gives no handle that points elsewhere', async () => {
		people('did:plc:someoneelseentirelyxxxxx');
		expect(await verifiedHandle(DID)).toBeNull();
	});

	it(
		'gives up on a server that never answers, so a page is not held up',
		{ timeout: 1000 },
		async () => {
			shortLimit();
			vi.stubGlobal('fetch', neverAnswers);
			expect(await verifiedHandle(DID)).toBeNull();
		}
	);

	// The library races DNS against https with a signal of its own, so this is the step that can
	// lose the limit. With nothing answering at all, the DID document stops the lookup before it.
	it(
		'gives up on a handle that never answers, once the DID document has',
		{ timeout: 1000 },
		async () => {
			shortLimit();
			vi.stubGlobal('fetch', (input: URL | string, init?: RequestInit) =>
				new URL(String(input)).pathname === '/.well-known/did.json'
					? Promise.resolve(didDocument())
					: neverAnswers(input, init)
			);
			expect(await verifiedHandle(DID)).toBeNull();
		}
	);
});

describe('addGuest', () => {
	it(
		'gives up on a handle that never answers, so the host gets an answer',
		{ timeout: 2000 },
		async () => {
			shortLimit();
			vi.stubGlobal('fetch', neverAnswers);
			const handle = vi.fn(async () => new Response());
			const refusal = addGuest(
				{ did: 'did:plc:hosthosthosthosthosthost', scope: HOST_SCOPE, handle },
				{ rkey: 'event', handleOrDid: 'stalled-guest.test' }
			);
			await expect(refusal).rejects.toSatisfy(
				(e) => e instanceof PrivateEventRefused && e.reason === 'no-such-person'
			);
			expect(handle).not.toHaveBeenCalled();
		}
	);
});
