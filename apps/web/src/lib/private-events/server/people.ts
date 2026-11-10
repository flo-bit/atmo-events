// How a page names a person it knows only by DID.
import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:workers';
import { getProfileFromContrail } from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
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

/** What a public page shows of a person: their profile from atmo's index, which fetches it from
 *  their server the first time it is asked. Null for someone moderation hides, or when it can't be
 *  read, so the page names them by handle as before. */
export async function publicProfile(did: string): Promise<PublicProfile | null> {
	try {
		const profile = await getProfileFromContrail(getServerClient(env.DB), did as Did);
		return profile?.value ?? null;
	} catch (e) {
		console.info(`[private-events] a profile unread: ${errorKind(e)}`);
		return null;
	}
}
