import { env } from 'cloudflare:workers';
import type { LayoutServerLoad } from './$types';
import { getViewerProfileFromContrail } from '#lib/contrail.js';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { blueskyPostCapability } from '#lib/atproto/settings.js';
import { getServerClient } from '#lib/contrail/index.js';
import { isModerator } from '#lib/moderation/server.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.did || !locals.client) {
		return {
			did: null,
			profile: null,
			canPostToBluesky: false,
			isModerator: false
		};
	}

	const profile = await getViewerProfileFromContrail(getServerClient(env.DB), locals.did);
	let canPostToBluesky = false;
	try {
		canPostToBluesky = await getAuth().api.can(blueskyPostCapability);
	} catch {
		// An unavailable token is not permission to write. Retry on the next load.
		console.warn('[oauth] permission check temporarily unavailable');
	}
	return {
		did: locals.did,
		profile,
		canPostToBluesky,
		isModerator: isModerator(locals.did)
	};
};
