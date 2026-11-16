import { redirect } from '@sveltejs/kit';
import { now as tidNow } from '@atcute/tid';
import { privateEventAccess } from '#lib/private-events/permissions-asked.js';
import { holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession, type CallerSession } from '#lib/private-events/server/caller.js';
import { privateEventsBeta } from '#lib/private-events/server/beta.js';
import { privateEventsEnabled, spacesServer } from '#lib/private-events/server/enabled.js';

/** Why "Private" needs a step first; null when it doesn't. */
function hostAccess(caller: CallerSession | null, url: URL) {
	if (!caller || holdsHostGrant(caller.scope, caller.did)) return null;
	return privateEventAccess(url, caller.did);
}

export async function load({ locals, url }) {
	if (!locals.did) {
		redirect(303, '/login');
	}

	// Offered to those who turned the beta on in Settings.
	const enabled = privateEventsEnabled() && (await privateEventsBeta(locals));
	const caller = enabled ? await callerSession(locals.session ?? null) : null;
	return {
		pageTitle: 'Create Event',
		actorDid: locals.did,
		rkey: tidNow(),
		privateEvents: enabled,
		hostAccess: enabled ? hostAccess(caller, url) : null,
		spacesServer: enabled ? spacesServer() : null
	};
}
