// Calls to servers other people chose: a guest's PDS, a host's, the domain behind a did:web or a
// handle. A page waits on them together, so any one of them could hold it up for everyone.
import type { AtprotoNetwork } from '@svelte-atproto/oauth/network';
import { atprotoNetwork } from '#lib/atproto/network.js';

/** Time for a small server to wake up. A server past it costs a page this wait, not the page. */
const TIME_LIMIT_MS = 8_000;

// Both calls below take the network's fetch out first. On the public network it is the runtime's own
// fetch, and a built Worker throws "Illegal invocation" if that runs as a method of the network.

/** For a call that carries a token or a signature, so it goes only where it was addressed: never to
 *  a redirect's target, and over https, except on an isolated network, which names its own origins. */
export async function fetchOtherServer(url: URL, init: RequestInit): Promise<Response> {
	const network = atprotoNetwork();
	network.assertUrl(url.href);
	if (!network.isolated && url.protocol !== 'https:') {
		throw new Error(`${url.origin} is not https`);
	}
	const { fetch: send } = network;
	return send(url, {
		...init,
		redirect: 'manual',
		signal: AbortSignal.timeout(TIME_LIMIT_MS)
	});
}

/** This deployment's network with the same time limit, for the library's identity lookups. The
 *  library races DNS against https with a signal of its own, so the limit joins that signal. */
export function timeLimitedNetwork(): AtprotoNetwork {
	const network = atprotoNetwork();
	const { fetch: send } = network;
	return {
		...network,
		fetch: (input, init) => {
			const limit = AbortSignal.timeout(TIME_LIMIT_MS);
			const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
			return send(input, { ...init, signal });
		}
	};
}
