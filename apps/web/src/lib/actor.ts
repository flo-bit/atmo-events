import type { Did, Handle } from '@atcute/lexicons';
import { isDid } from '@atcute/lexicons/syntax';
import { resolveHandle } from '@svelte-atproto/oauth/helper';
import { DOH_RESOLVER } from '#lib/atproto/settings.js';

const HANDLE_CACHE_TTL_MS = 60 * 60 * 1000;
const handleCache = new Map<string, { did: Did; at: number }>();

/** Keep successful actor lookups warm; retry transient DNS/PDS failures. */
export async function actorToDid(actor: string): Promise<Did> {
	if (isDid(actor)) return actor;
	const cached = handleCache.get(actor);
	if (cached && Date.now() - cached.at < HANDLE_CACHE_TTL_MS) return cached.did;

	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const did = await resolveHandle({
				handle: actor as Handle,
				doh: DOH_RESOLVER,
				slingshot: false
			});
			handleCache.set(actor, { did, at: Date.now() });
			return did;
		} catch (error) {
			lastError = error;
			if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
		}
	}
	throw lastError;
}

/** Route-facing variant: an unresolved actor is a not-found result. */
export async function getActor(actor: string): Promise<string | null> {
	try {
		return await actorToDid(actor);
	} catch {
		return null;
	}
}
