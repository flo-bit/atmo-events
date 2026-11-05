import { redirect, type Cookies } from '@sveltejs/kit';
import { now as tidNow } from '@atcute/tid';
import { forgetAsked, privateEventAccess } from '#lib/private-events/permissions-asked.js';
import { holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled, spacesServer } from '#lib/private-events/server/enabled.js';

/** Why "invited people only" needs a step first; null when it doesn't. */
async function hostAccess(locals: App.Locals, cookies: Cookies) {
	const caller = await callerSession(locals.session ?? null);
	if (!caller) return null;
	if (!holdsHostGrant(caller.scope, caller.did)) return privateEventAccess(cookies, caller.did);
	forgetAsked(cookies);
	return null;
}

export async function load({ locals, cookies }) {
	if (!locals.did) {
		redirect(303, '/login');
	}

	const enabled = privateEventsEnabled();
	return {
		pageTitle: 'Create Event',
		actorDid: locals.did,
		rkey: tidNow(),
		privateEvents: enabled,
		hostAccess: enabled ? await hostAccess(locals, cookies) : null,
		spacesServer: enabled ? spacesServer() : null
	};
}
