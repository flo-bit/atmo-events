import { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import type { ResourceUri } from '@atcute/lexicons/syntax';
import {
	TokenInvalidError,
	TokenRefreshError,
	TokenRevokedError,
	AuthMethodUnsatisfiableError
} from '@atcute/oauth-node-client';
import { createOAuthClient } from '$lib/atproto/server/oauth';
import { getRsvpStatus, getViewerRsvpFromContrail } from '$lib/contrail';
import { RSVP_COLLECTION, RSVP_GOING_STATUS } from './config';
import type { ResolvedEvent } from './resolve-event';

/**
 * - `ok`: RSVP exists/created as going — the bot should like the reply.
 * - `no-token`: the user's session is gone or lacks RSVP scope — nudge them.
 * - `error`: transient failure — leave unprocessed so the next tick retries.
 */
export type RsvpResult = 'ok' | 'no-token' | 'error';

const RSVP_NSID = RSVP_COLLECTION as `${string}.${string}.${string}`;

/** Whether an OAuth restore error means the session is genuinely unrecoverable. */
function isSessionGone(e: unknown): boolean {
	return (
		e instanceof TokenInvalidError ||
		e instanceof TokenRevokedError ||
		e instanceof TokenRefreshError ||
		e instanceof AuthMethodUnsatisfiableError
	);
}

/**
 * RSVP `userDid` to `event` as "going", using their stored OAuth token.
 * Idempotent: if they're already going we no-op; if they previously RSVP'd
 * interested/notgoing we flip the existing record to going.
 */
export async function rsvpOnBehalf(
	env: App.Platform['env'],
	serverClient: Client,
	userDid: Did,
	event: ResolvedEvent
): Promise<RsvpResult> {
	// No stored session at all ⇒ they've never signed in ⇒ nudge them (don't retry).
	if ((await env.OAUTH_SESSIONS.get(userDid)) === null) return 'no-token';

	let session;
	try {
		session = await createOAuthClient(env).restore(userDid);
	} catch (e) {
		if (isSessionGone(e)) return 'no-token';
		console.error('[bot] session restore failed (transient):', e);
		return 'error';
	}

	const client = new Client({ handler: session });

	// Look up any existing RSVP so we don't duplicate, and can flip status.
	let existing = null;
	try {
		existing = await getViewerRsvpFromContrail(serverClient, {
			eventUri: event.uri,
			actor: userDid
		});
	} catch {
		// Index miss is fine — we'll just create a fresh record.
	}

	if (existing && getRsvpStatus(existing.value?.status) === 'going') return 'ok';

	const record = {
		$type: RSVP_COLLECTION,
		createdAt: new Date().toISOString(),
		status: RSVP_GOING_STATUS,
		subject: { uri: event.uri, cid: event.cid }
	};

	const response = existing
		? await client.post('com.atproto.repo.putRecord', {
				input: { repo: userDid, collection: RSVP_NSID, rkey: existing.rkey, record }
			})
		: await client.post('com.atproto.repo.createRecord', {
				input: { repo: userDid, collection: RSVP_NSID, record }
			});

	if (!response.ok) {
		// 401/403 ⇒ token revoked or missing the RSVP write scope ⇒ ask them to re-auth.
		if (response.status === 401 || response.status === 403) return 'no-token';
		console.error('[bot] RSVP write failed:', response.status, response.data);
		return 'error';
	}

	const createdUri = (response.data as { uri?: string })?.uri;
	if (createdUri) {
		// Best-effort: nudge contrail to re-index now instead of waiting for the firehose.
		try {
			await serverClient.post('rsvp.atmo.notifyOfUpdate', {
				input: { uris: [createdUri as ResourceUri] }
			});
		} catch {
			// Harmless — the next ingest tick will pick it up.
		}
	}

	return 'ok';
}
