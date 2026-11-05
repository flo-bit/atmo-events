import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSpaceLookups } from '#lib/spaces/server/space-credential.js';
import { verifiedHandle } from './people';

// The network object keeps the fetch it is made with, and these tests stub a new one each time.
vi.mock('#lib/atproto/network.js', async () => {
	const { createAtprotoNetwork } = await import('@svelte-atproto/oauth/network');
	const standard = createAtprotoNetwork({ fetch: (input, init) => globalThis.fetch(input, init) });
	return { atprotoNetwork: () => standard };
});

const DID = 'did:web:someone.test';
const HANDLE = 'someone.test';

/** Answers for a person's DID document and for the DID their handle points at. */
function people(pointsAt: string) {
	vi.stubGlobal('fetch', async (input: URL | string) => {
		const url = new URL(String(input));
		if (url.pathname === '/.well-known/did.json') {
			return Response.json({
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
		}
		if (url.pathname === '/.well-known/atproto-did') return new Response(pointsAt);
		return Response.json({ Status: 0, Answer: [] });
	});
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
			const realTimeout = AbortSignal.timeout.bind(AbortSignal);
			vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
			vi.stubGlobal(
				'fetch',
				(_input: unknown, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
					})
			);
			expect(await verifiedHandle(DID)).toBeNull();
		}
	);
});
