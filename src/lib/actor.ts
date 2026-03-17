import { actorToDid } from '$lib/atproto/methods';
import type { ActorIdentifier } from '@atcute/lexicons';

/**
 * Resolves an actor param (handle or DID) to a DID string.
 * Returns null if resolution fails.
 */
export async function getActor(actor: ActorIdentifier): Promise<string | null> {
	try {
		return await actorToDid(actor);
	} catch {
		return null;
	}
}
