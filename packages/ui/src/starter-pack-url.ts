import { socialClientInfo, type PreferredSocialClient } from '@atmo-dev/kit/social';

/** The pack service returns canonical Bluesky links; navigation is viewer-specific. */
export function starterPackClientUrl(
	canonicalUrl: string,
	socialClient?: PreferredSocialClient | null
): string | null {
	try {
		const url = new URL(canonicalUrl);
		if (
			url.origin !== 'https://bsky.app' || url.username || url.password ||
			!/^\/starter-pack\/[^/]+\/[^/]+$/.test(url.pathname)
		) return null;
		return `${socialClientInfo(socialClient).url}${url.pathname}${url.search}${url.hash}`;
	} catch {
		return null;
	}
}
