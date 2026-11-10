// How a page names a person it knows only by DID.
import { env } from 'cloudflare:workers';
import { profilesOf } from '#lib/contrail/index.js';
import { spaceIdentity } from '#lib/spaces/server/space-credential.js';
import { errorKind } from '#lib/spaces/server/xrpc.js';

export interface PublicProfile {
	displayName?: string;
	avatar?: unknown;
}

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

/** What a public page shows of each person, from one lookup in atmo's index for all of them.
 *  Someone moderation hides, or with no profile, is left out, and so is everyone when the index
 *  can't be read, so the page names them by handle as before. */
export async function publicProfiles(dids: string[]): Promise<Map<string, PublicProfile>> {
	const found = new Map<string, PublicProfile>();
	if (dids.length === 0) return found;
	try {
		const profiles = await profilesOf(env.DB, dids);
		for (const [did, entries] of Object.entries(profiles)) {
			const value = entries.find((entry) => entry.value && typeof entry.value === 'object')?.value;
			if (value) found.set(did, value as PublicProfile);
		}
	} catch (e) {
		console.info(`[private-events] profiles unread: ${errorKind(e)}`);
	}
	return found;
}
