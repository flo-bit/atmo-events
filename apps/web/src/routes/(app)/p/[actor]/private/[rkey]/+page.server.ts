import { error, redirect } from '@sveltejs/kit';
import { getActor } from '#lib/actor.js';
import { privateEventUri } from '#lib/private-events/ids.js';
import {
	forgetAsked,
	hasOpened,
	markOpened,
	privateEventAccess
} from '#lib/private-events/permissions-asked.js';
import { holdsGuestGrant, holdsHostGrant } from '#lib/private-events/scopes.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled, spacesServer } from '#lib/private-events/server/enabled.js';
import { readPrivateEventPage } from '#lib/private-events/server/events.js';

/** Byte for byte, so someone kept out can't tell an event that exists from one that doesn't, or from
 *  one that was cancelled. */
const EVENT_NOT_AVAILABLE =
	"This event isn't available. It may have been cancelled, or you may not be on its guest list.";

// Each step below is the same at any address, so it says nothing about whether this event exists.
export async function load({ params, locals, cookies, setHeaders }) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	const host = await getActor(params.actor);
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
	if (!isHost && !hasOpened(cookies, caller.did)) return { ...base, view: 'open' as const };

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
		actorDid: host,
		rkey: params.rkey,
		hostProfile: { did: host, handle: found.hostHandle ?? undefined },
		attendees: found.attendees,
		answersUnread: found.answersUnread,
		viewerRsvpStatus: found.viewerStatus,
		viewerRsvpRkey: found.viewerStatus ? params.rkey : null,
		eventUri: privateEventUri(host, params.rkey),
		shareable: false,
		loggedIn: true,
		guests: found.guests
	};
}

export const actions = {
	open: async ({ locals, cookies, url }) => {
		if (!privateEventsEnabled()) error(404, 'Not found');
		const caller = await callerSession(locals.session ?? null);
		if (caller) markOpened(cookies, url, caller.did);
		redirect(303, url.pathname);
	}
};
