import { error } from '@sveltejs/kit';
import { getActor } from '#lib/actor.js';
import { parseEventDescription } from '#lib/server/event-description.js';
import { timeLimitedNetwork } from '#lib/spaces/server/other-servers.js';
import { errorKind } from '#lib/spaces/server/xrpc.js';
import { privateEventAccess } from '../permissions-asked';
import { holdsGuestGrant, holdsHostGrant } from '../scopes';
import { callerSession, type CallerSession } from './caller';
import { privateEventsEnabled, spacesServer } from './enabled';
import { readPrivateEventForEdit, type PrivateEventPage } from './events';

interface EventPageRequest {
	params: { actor: string; rkey: string };
	locals: App.Locals;
	url: URL;
	setHeaders: (headers: Record<string, string>) => void;
}

const NOT_EDITABLE = "This event isn't available.";

/** A private event's page. `read` gives the event as the caller may see it, or null;
 *  `notAvailable` is what the page says then, byte for byte the same for an event that isn't
 *  there, so someone kept out can't tell the two apart. Each step before the read is the same at
 *  any address, so it says nothing about whether this event exists. */
export async function loadEventPage(
	{ params, locals, url, setHeaders }: EventPageRequest,
	notAvailable: string,
	read: (caller: CallerSession, host: string) => Promise<PrivateEventPage | null>
) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	const host = await getActor(params.actor, timeLimitedNetwork());
	if (!host) error(404, notAvailable);

	const caller = await callerSession(locals.session ?? null);
	const base = { pageTitle: 'Private event' };
	if (!caller) return { ...base, view: 'signed-out' as const };

	const isHost = caller.did === host;
	const granted = isHost ? holdsHostGrant(caller.scope, caller.did) : holdsGuestGrant(caller.scope);
	if (!granted) {
		return {
			...base,
			view: 'grant' as const,
			isHost,
			did: caller.did,
			access: privateEventAccess(url, caller.did),
			spacesServer: spacesServer()
		};
	}
	const found = await read(caller, host).catch((e) => {
		console.error(`[private-events] event unread for its page: ${errorKind(e)}`);
		error(503, 'This event could not be read right now. Try again shortly.');
	});
	if (!found) error(404, notAvailable);

	const { event, host: hostPerson, viewerStatus, ...rest } = found;
	return {
		...base,
		view: 'event' as const,
		pageTitle: event.name,
		eventData: event,
		description: parseEventDescription(event),
		actorDid: host,
		rkey: params.rkey,
		hostProfile: {
			did: host,
			handle: hostPerson.handle,
			displayName: hostPerson.value?.displayName
		},
		viewerRsvpStatus: viewerStatus,
		viewerRsvpRkey: viewerStatus ? params.rkey : null,
		loggedIn: true,
		isHost,
		// Its answers and guests, as read.
		...rest
	};
}

/** A host's own event for its edit page. Anyone else is told what a made-up address tells them. */
export async function loadEditPage({ params, locals, setHeaders }: Omit<EventPageRequest, 'url'>) {
	if (!privateEventsEnabled()) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	const host = await getActor(params.actor, timeLimitedNetwork());
	const caller = await callerSession(locals.session ?? null);
	if (!host || caller?.did !== host || !holdsHostGrant(caller.scope, caller.did)) {
		error(404, NOT_EDITABLE);
	}
	const eventData = await readPrivateEventForEdit(caller, params.rkey).catch((e) => {
		console.error(`[private-events] event unread for its edit page: ${errorKind(e)}`);
		error(503, 'This event could not be read right now. Try again shortly.');
	});
	if (!eventData) error(404, NOT_EDITABLE);
	return {
		pageTitle: 'Edit private event',
		eventData,
		actorDid: host,
		rkey: params.rkey
	};
}
