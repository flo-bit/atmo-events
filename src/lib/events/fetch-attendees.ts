import type { Did } from '@atcute/lexicons';
import { getDetailedProfile } from '$lib/atproto/methods';

const MICROCOSM_URL = 'https://constellation.microcosm.blue';

/**
 * Fetches RSVPs for an event from Microcosm backlinks.
 * Returns a Map of DID -> status ('going' | 'interested').
 */
export async function fetchEventRsvps(
	eventUri: string
): Promise<Map<string, 'going' | 'interested'>> {
	const rsvpMap = new Map<string, 'going' | 'interested'>();

	const url = `${MICROCOSM_URL}/xrpc/blue.microcosm.links.getBacklinks?subject=${encodeURIComponent(eventUri)}&source=community.lexicon.calendar.rsvp:subject.uri&limit=100`;

	const res = await fetch(url);
	if (!res.ok) return rsvpMap;

	const data: { records?: Array<{ did: string; record?: { status?: string } }> } = await res.json();
	if (!data?.records) return rsvpMap;

	for (const record of data.records) {
		const status = record.record?.status;
		if (!status) continue;

		if (status.includes('#going')) {
			rsvpMap.set(record.did, 'going');
		} else if (status.includes('#interested')) {
			rsvpMap.set(record.did, 'interested');
		}
	}

	return rsvpMap;
}

export interface ResolvedProfile {
	handle?: string;
	displayName?: string;
	avatar?: string;
	url?: string;
}

/**
 * Resolves a DID to profile info.
 */
export async function resolveProfile(
	did: string,
	profileCache?: KVNamespace
): Promise<ResolvedProfile | null> {
	// Try cache first
	if (profileCache) {
		try {
			const cached = await profileCache.get(did, 'json');
			if (cached) {
				const p = cached as Record<string, unknown>;
				return {
					handle: p.handle as string | undefined,
					displayName: p.displayName as string | undefined,
					avatar: p.avatar as string | undefined,
					url: `https://bsky.app/profile/${(p.handle as string) || did}`
				};
			}
		} catch {
			// Cache miss, continue
		}
	}

	try {
		const profile = await getDetailedProfile({ did: did as Did });
		if (!profile) return null;

		const result: ResolvedProfile = {
			handle: profile.handle,
			displayName: profile.displayName,
			avatar: profile.avatar,
			url: `https://bsky.app/profile/${profile.handle || did}`
		};

		// Cache the profile
		if (profileCache) {
			profileCache
				.put(did, JSON.stringify(profile), { expirationTtl: 3600 })
				.catch(() => {});
		}

		return result;
	} catch {
		return null;
	}
}

/**
 * Gets a profile URL for a DID.
 */
export function getProfileUrl(
	did: string,
	profile?: ResolvedProfile | null
): string {
	const handle = profile?.handle;
	return handle
		? `https://bsky.app/profile/${handle}`
		: `https://bsky.app/profile/${did}`;
}
