import { env, waitUntil } from 'cloudflare:workers';
import type { LayoutServerLoad } from './$types';
import { getViewerProfileFromContrail } from '#lib/contrail.js';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { blueskyPostCapability } from '#lib/atproto/settings.js';
import { getServerClient } from '#lib/contrail/index.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.did || !locals.client) {
		return { did: null, profile: null, canPostToBluesky: false };
	}

	// Warm the first authenticated page after login. This keeps the network-feed
	// bootstrap out of the response path without replacing the library callback.
	if (env.DB) waitUntil(prewarmNetworkFeed(locals.did));
	const profile = await getViewerProfileFromContrail(getServerClient(env.DB), locals.did);
	let canPostToBluesky = false;
	try {
		canPostToBluesky = await getAuth().api.can(blueskyPostCapability);
	} catch {
		// An unavailable token is not permission to write. Retry on the next load.
		console.warn('[oauth] permission check temporarily unavailable');
	}
	return { did: locals.did, profile, canPostToBluesky };
};

async function prewarmNetworkFeed(did: `did:${string}:${string}`): Promise<void> {
	try {
		await getServerClient(env.DB).get('rsvp.atmo.getFeed', {
			params: { feed: 'network', actor: did, collection: 'rsvp', limit: 1 }
		});
	} catch {
		console.warn('[oauth] feed pre-warm failed');
	}
}
