import { error, redirect } from '@sveltejs/kit';
import { forgetAsked, privateEventAccess } from '#lib/private-events/permissions-asked.js';
import { holdsGuestGrant, holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled, spacesServer } from '#lib/private-events/server/enabled.js';
import { myPrivateEvents } from '#lib/private-events/server/events.js';

export async function load({ locals, cookies }) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	const caller = await callerSession(locals.session ?? null);
	if (!caller) redirect(303, '/login');
	const base = { pageTitle: 'Private events', did: caller.did };
	if (!holdsGuestGrant(caller.scope) && !holdsHostGrant(caller.scope, caller.did)) {
		return {
			...base,
			events: null,
			access: privateEventAccess(cookies, caller.did),
			spacesServer: spacesServer()
		};
	}
	forgetAsked(cookies);
	const events = await myPrivateEvents(caller).catch((e) => {
		console.error(`[private-events] ${caller.did}: private events unread:`, e);
		error(503, 'Your private events could not be read right now. Try again shortly.');
	});
	return { ...base, events, access: null, spacesServer: null };
}
