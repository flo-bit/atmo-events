import type { Handle } from '@sveltejs/kit';
import { restoreSession } from '$lib/atproto/server/session';
import { connectToOpenMeet } from '$lib/openmeet/auth';
import { OPENMEET_ENABLED } from '$lib/openmeet/client';
import type { OpenMeetTokens } from '$lib/openmeet/types';

// Simple in-memory cache for OpenMeet tokens (per DID)
const openmeetTokens = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes (tokens last 60min, refresh early)

// Coalesce concurrent refresh attempts for the same DID
const pendingRefreshes = new Map<string, Promise<OpenMeetTokens | null>>();

export const handle: Handle = async ({ event, resolve }) => {
	const { session, client, did } = await restoreSession(
		event.cookies,
		event.platform?.env
	);

	event.locals.session = session;
	event.locals.client = client;
	event.locals.did = did;
	event.locals.openmeetToken = null;

	// If user is authenticated and OpenMeet is configured, try to get/restore a token
	if (OPENMEET_ENABLED && did && client) {
		const cached = openmeetTokens.get(did);
		if (cached && cached.expiresAt > Date.now()) {
			event.locals.openmeetToken = cached.token;
		} else {
			// Coalesce concurrent refreshes for the same DID
			let promise = pendingRefreshes.get(did);
			if (!promise) {
				promise = connectToOpenMeet(client).finally(() => pendingRefreshes.delete(did));
				pendingRefreshes.set(did, promise);
			}

			const tokens = await promise;
			if (tokens) {
				event.locals.openmeetToken = tokens.token;
				openmeetTokens.set(did, {
					token: tokens.token,
					expiresAt: Date.now() + TOKEN_TTL_MS
				});
			}
		}
	}

	return resolve(event);
};
