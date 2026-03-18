import { actorToDid } from '$lib/atproto/methods';

/**
 * Resolves an actor param (handle or DID) to a DID string.
 * Returns null if resolution fails.
 */
export async function getActor(actor: string): Promise<string | null> {
	try {
		return await actorToDid(actor);
	} catch {
		return null;
	}
}
