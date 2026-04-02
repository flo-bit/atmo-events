import type { Did } from '@atcute/lexicons';
import { getProfileFromContrail, getProfileBlobUrl, getServerClient } from '$lib/contrail';

const PROFILE_CACHE_TTL = 60 * 60; // 1 hour

/**
 * Loads a user's profile, with optional KV caching.
 * Falls back to a fresh fetch if the cache KV doesn't exist or on cache miss.
 * Returns undefined if the profile can't be loaded.
 */
export async function loadProfile(did: Did, db: D1Database, profileCache?: KVNamespace) {
	// Try cache first
	if (profileCache) {
		try {
			const cached = await profileCache.get(did, 'json');
			if (cached) return cached as Record<string, unknown>;
		} catch {
			// Cache read failed, continue to fresh fetch
		}
	}

	const profile = await fetchProfile(did, db);

	// Write to cache (fire-and-forget)
	if (profileCache && profile) {
		profileCache
			.put(did, JSON.stringify(profile), { expirationTtl: PROFILE_CACHE_TTL })
			.catch(() => {});
	}

	return profile;
}

async function fetchProfile(did: Did, db: D1Database) {
	try {
		const client = getServerClient(db);
		const p = await getProfileFromContrail(client, did);

		if (!p || p.handle === 'handle.invalid') {
			return { did, handle: 'handle.invalid' };
		}

		return {
			did: p.did,
			handle: p.handle ?? 'handle.invalid',
			displayName: p.record?.displayName,
			avatar: p.record?.avatar ? getProfileBlobUrl(p.did, p.record.avatar) : undefined
		};
	} catch (e) {
		console.error('Failed to load profile:', e);
		return undefined;
	}
}
