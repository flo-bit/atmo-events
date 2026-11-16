// How a page names a person it knows only by DID.
import { env, waitUntil } from 'cloudflare:workers';
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

/** How long a page waits on profiles. The index fetches one it hasn't seen from the person's
 *  server, after finding that server, and finding it has no time limit of its own. */
const PROFILES_WAIT_MS = 3_000;

/** What a public page shows of each person, from one lookup in atmo's index for all of them.
 *  Someone moderation hides, or with no profile, is left out, and so is everyone when the index
 *  can't be read or doesn't answer in time, so the page names them by handle as before. */
export async function publicProfiles(dids: string[]): Promise<Map<string, PublicProfile>> {
	const found = new Map<string, PublicProfile>();
	if (dids.length === 0) return found;
	// Kept going past the wait: a Worker cuts off what a response leaves running, and the index
	// shares a lookup in flight with later requests, which would then wait on one that never ends.
	const lookup = profilesOf(env.DB, dids);
	waitUntil(lookup.catch(() => {}));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), PROFILES_WAIT_MS);
	});
	try {
		const profiles = await Promise.race([lookup, late]);
		if (!profiles) {
			console.info('[private-events] profiles too slow; named by handle');
			return found;
		}
		for (const [did, entries] of Object.entries(profiles)) {
			const value = entries.find((entry) => entry.value && typeof entry.value === 'object')?.value;
			if (value) found.set(did, value as PublicProfile);
		}
	} catch (e) {
		console.info(`[private-events] profiles unread: ${errorKind(e)}`);
	} finally {
		clearTimeout(timer);
	}
	return found;
}
