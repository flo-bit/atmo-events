import { blueskyProfileToProfileData, type ProfileData } from '@atmo-dev/kit';
import { serviceUrl } from '#lib/atproto/network.js';

const profiles = new Map<string, Promise<ProfileData | undefined>>();

/** Shared by visible rows; a missing Bluesky profile does not prevent meeting a DID. */
export function meetingProfile(did: string) {
	let profile = profiles.get(did);
	if (!profile) {
		profile = (async () => {
			try {
				const url = new URL(`${serviceUrl('appview')}/xrpc/app.bsky.actor.getProfile`);
				url.searchParams.set('actor', did);
				const response = await fetch(url, {
					signal: AbortSignal.timeout(5000),
					credentials: 'omit'
				});
				if (!response.ok) return undefined;
				const result = blueskyProfileToProfileData(await response.json());
				return result?.did === did ? result : undefined;
			} catch {
				return undefined;
			}
		})();
		profiles.set(did, profile);
		// Bound the per-tab cache. Failed reads can be retried after leaving the page.
		if (profiles.size > 300) profiles.delete(profiles.keys().next().value!);
	}
	return profile;
}
