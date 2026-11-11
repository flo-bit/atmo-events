import { error } from '@sveltejs/kit';
import { getActor } from '#lib/actor.js';
import { forgetAsked, privateEventAccess } from '#lib/private-events/permissions-asked.js';
import { holdsGuestGrant, holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled, spacesServer } from '#lib/private-events/server/enabled.js';
import { readPrivateEventPage } from '#lib/private-events/server/events.js';
import { parseEventDescription } from '#lib/server/event-description.js';
import { timeLimitedNetwork } from '#lib/spaces/server/other-servers.js';

/** Byte for byte, so someone kept out can't tell an event that exists from one that doesn't, or from
 *  one that was cancelled. */
const EVENT_NOT_AVAILABLE =
	"This event isn't available. It may have been cancelled, or you may not be on its guest list.";

// Each step below is the same at any address, so it says nothing about whether this event exists.
export async function load({ params, locals, cookies, setHeaders }) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	const host = await getActor(params.actor, timeLimitedNetwork());
	if (!host) error(404, EVENT_NOT_AVAILABLE);

	const caller = await callerSession(locals.session ?? null);
	const base = { pageTitle: 'Private event', robots: 'noindex' };
	if (!caller) return { ...base, view: 'signed-out' as const };

	const isHost = caller.did === host;
	const granted = isHost ? holdsHostGrant(caller.scope, caller.did) : holdsGuestGrant(caller.scope);
	if (!granted) {
		return {
			...base,
			view: 'grant' as const,
			isHost,
			did: caller.did,
			access: privateEventAccess(cookies, caller.did),
			spacesServer: spacesServer()
		};
	}
	forgetAsked(cookies);
	// Reading it asks the host's server, which learns who is asking and when. A guest was once asked
	// to choose that first; it cost every guest a click on every event, so the read is direct.
	const found = await readPrivateEventPage(caller, host, params.rkey).catch((e) => {
		console.error(`[private-events] ${host}: event ${params.rkey} unread for ${caller.did}:`, e);
		error(503, 'This event could not be read right now. Try again shortly.');
	});
	if (!found) error(404, EVENT_NOT_AVAILABLE);

	return {
		...base,
		view: 'event' as const,
		pageTitle: found.event.name,
		eventData: found.event,
		description: parseEventDescription(found.event),
		actorDid: host,
		rkey: params.rkey,
		hostProfile: { did: host, handle: found.hostHandle ?? undefined },
		attendees: found.attendees,
		answersUnread: found.answersUnread,
		viewerRsvpStatus: found.viewerStatus,
		viewerRsvpRkey: found.viewerStatus ? params.rkey : null,
		loggedIn: true,
		guests: found.guests
	};
}
