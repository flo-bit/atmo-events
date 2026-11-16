// How a page names a person it knows only by DID.
import { spaceIdentity } from '#lib/spaces/server/space-credential.js';
import { errorKind } from '#lib/spaces/server/xrpc.js';

/** The handle a DID claims, once that handle points back at it; null otherwise. */
export async function verifiedHandle(did: string): Promise<string | null> {
	try {
		const { handle } = await spaceIdentity(did);
		return handle === 'handle.invalid' ? null : handle;
	} catch (e) {
		console.info(`[private-events] a handle unverified: ${errorKind(e)}`);
		return null;
	}
}
