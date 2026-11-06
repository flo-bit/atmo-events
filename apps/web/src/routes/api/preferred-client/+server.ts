import { json } from '@sveltejs/kit';
import { parsePreferredSocialClient } from '@atmo-dev/kit/social';
import { getPreferredClientRecord } from '#lib/atproto/preferred-client.server.js';
import type { RequestHandler } from './$types';

const headers = { 'cache-control': 'private, no-store' };

/** Called only on a browser-cache miss; never accepts another account's DID. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.did || !locals.client) {
		return json({ error: 'Sign in to load your selection.' }, { status: 401, headers });
	}
	try {
		const record = await getPreferredClientRecord(
			locals.client,
			locals.did,
			AbortSignal.timeout(5_000)
		);
		return json(
			{ did: locals.did, value: parsePreferredSocialClient(record?.record) },
			{ headers }
		);
	} catch {
		return json({ error: 'Could not load your selection.' }, { status: 502, headers });
	}
};
