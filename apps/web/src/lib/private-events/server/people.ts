// How a page names a person it knows only by DID.
import type { Did } from '@atcute/lexicons';
import { createDidDocumentResolver } from '@svelte-atproto/oauth/network';
import { actorToDid } from '#lib/actor.js';
import { atprotoNetwork } from '#lib/atproto/network.js';

let resolver: ReturnType<typeof createDidDocumentResolver> | undefined;

/** The handle a DID claims, once that handle points back at it; null otherwise. */
export async function verifiedHandle(did: string): Promise<string | null> {
	try {
		resolver ??= createDidDocumentResolver({ network: atprotoNetwork() });
		const doc = await resolver.resolve(did as Did<'plc'> | Did<'web'>);
		const handle = doc.alsoKnownAs?.find((name) => name.startsWith('at://'))?.slice('at://'.length);
		if (!handle) return null;
		return (await actorToDid(handle)) === did ? handle : null;
	} catch (e) {
		console.info(`[private-events] no handle for ${did}:`, e);
		return null;
	}
}
