import { error, redirect } from '@sveltejs/kit';
import { forgetAsked, privateEventAccess } from '#lib/private-events/permissions-asked.js';
import { holdsGuestGrant, holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsBeta } from '#lib/private-events/server/beta.js';
import { privateEventsEnabled, spacesServer } from '#lib/private-events/server/enabled.js';
import { myPrivateEvents } from '#lib/private-events/server/events.js';

export async function load({ locals, cookies, setHeaders }) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	const caller = await callerSession(locals.session ?? null);
	if (!caller) redirect(303, '/login');
	const base = {
		pageTitle: 'Private events',
		did: caller.did,
		beta: await privateEventsBeta(locals)
	};
	if (!holdsGuestGrant(caller.scope) && !holdsHostGrant(caller.scope, caller.did)) {
		return {
			...base,
			events: null,
			incomplete: false,
			access: privateEventAccess(cookies, caller.did),
			spacesServer: spacesServer()
		};
	}
	forgetAsked(cookies);
	const { events, incomplete } = await myPrivateEvents(caller).catch((e) => {
		console.error(`[private-events] ${caller.did}: private events unread:`, e);
		error(503, 'Your private events could not be read right now. Try again shortly.');
	});
	return { ...base, events, incomplete, access: null, spacesServer: null };
}
