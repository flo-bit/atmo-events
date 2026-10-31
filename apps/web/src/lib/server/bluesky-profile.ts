import { blueskyProfileToProfileData } from '@atmo-dev/kit';

/** Optional hydration for modern profile links and Bluesky metrics. Never fetch link destinations. */
export async function getBlueskyProfile(did: string, fetcher: typeof fetch = fetch) {
	try {
		const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile');
		url.searchParams.set('actor', did);
		const response = await fetcher(url, {
			signal: AbortSignal.timeout(2500),
			redirect: 'error',
			credentials: 'omit'
		});
		if (!response.ok) return undefined;
		const profile = blueskyProfileToProfileData(await response.json());
		return profile?.did === did ? profile : undefined;
	} catch {
		// Public Bluesky availability must not determine whether an RSVP profile loads.
		return undefined;
	}
}
