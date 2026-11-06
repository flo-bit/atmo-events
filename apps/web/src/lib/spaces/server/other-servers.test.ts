import { describe, expect, it, vi } from 'vitest';
import { fetchOtherServer, timeLimitedNetwork } from './other-servers';

// A network on the public atproto network holds the runtime's own fetch, and on Workers that fetch
// refuses to run as a method of another object. vite dev doesn't refuse, so only a built Worker
// showed this. This stands in for it, held directly, with no wrapper to hide the call.
const runtimeFetch = vi.hoisted(
	() =>
		function (this: unknown): Promise<Response> {
			if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
			return Promise.resolve(new Response('answered'));
		}
);
vi.mock('#lib/atproto/network.js', async () => {
	const { createAtprotoNetwork } = await import('@svelte-atproto/oauth/network');
	const network = createAtprotoNetwork({ fetch: runtimeFetch });
	return { atprotoNetwork: () => network };
});

describe('calls to the runtime fetch', () => {
	it('fetchOtherServer gets an answer', async () => {
		const res = await fetchOtherServer(new URL('https://pds.test/xrpc/x'), { method: 'GET' });
		expect(await res.text()).toBe('answered');
	});

	it('the identity lookups get an answer', async () => {
		const res = await timeLimitedNetwork().fetch('https://plc.test/did:plc:abc');
		expect(await res.text()).toBe('answered');
	});
});
