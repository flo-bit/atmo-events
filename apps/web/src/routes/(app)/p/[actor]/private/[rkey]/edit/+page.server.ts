import { error } from '@sveltejs/kit';
import { getActor } from '#lib/actor.js';
import { holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';
import { readPrivateEventForEdit } from '#lib/private-events/server/events.js';

const EVENT_NOT_AVAILABLE = "This event isn't available.";

export async function load({ params, locals }) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	const host = await getActor(params.actor);
	const caller = await callerSession(locals.session ?? null);
	if (!host || caller?.did !== host || !holdsHostGrant(caller.scope, caller.did)) {
		error(404, EVENT_NOT_AVAILABLE);
	}
	const eventData = await readPrivateEventForEdit(caller, params.rkey).catch((e) => {
		console.error(`[private-events] ${host}: event ${params.rkey} unread for its edit page:`, e);
		error(503, 'This event could not be read right now. Try again shortly.');
	});
	if (!eventData) error(404, EVENT_NOT_AVAILABLE);
	return { pageTitle: 'Edit private event', eventData, actorDid: host, rkey: params.rkey };
}
