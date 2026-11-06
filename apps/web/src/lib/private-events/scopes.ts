// What a person's own sign-in needs for private events, asked for when they first host or open one
// and never at sign-in, since most servers can't grant it yet. Values and pure checks only, so the
// OAuth config can import them.
import { EVENT_COLLECTION, PRIVATE_CALENDAR_TYPE, RSVP_COLLECTION } from './ids';

const RECORD_ACTIONS = 'action=read&action=create&action=update&action=delete';

/** Their own events and their own answers to them, and managing each event's space. */
export const HOST_SCOPE = `space:${PRIVATE_CALENDAR_TYPE}?authority=self&collection=${EVENT_COLLECTION}&collection=${RSVP_COLLECTION}&${RECORD_ACTIONS}&manage=create&manage=update&manage=delete`;

/** Reading any private event that lets them in, and their own answer to it. No manage rights: a
 *  guest is never asked to let atmo run spaces on their behalf. */
export const GUEST_SCOPE = `space:${PRIVATE_CALENDAR_TYPE}?authority=*&collection=${RSVP_COLLECTION}&${RECORD_ACTIONS}`;

/** A host may also be someone else's guest, and a new grant must not cost them the other. */
export const HOST_SCOPES: readonly string[] = [HOST_SCOPE, GUEST_SCOPE];
export const GUEST_SCOPES: readonly string[] = [GUEST_SCOPE];
export const PRIVATE_EVENT_SCOPES: readonly string[] = HOST_SCOPES;

const DEFAULT_ACTIONS: readonly string[] = ['read', 'create', 'update', 'delete'];

function calendarGrants(scope: string): URLSearchParams[] {
	return scope
		.split(' ')
		.filter((token) => token.startsWith(`space:${PRIVATE_CALENDAR_TYPE}?`))
		.map((token) => new URLSearchParams(token.slice(token.indexOf('?') + 1)));
}

function allowsRecords(grant: URLSearchParams, collection: string): boolean {
	const actions = grant.getAll('action');
	const collections = grant.getAll('collection');
	return (
		(actions.length > 0 ? actions : DEFAULT_ACTIONS).includes('create') &&
		(collections.includes('*') || collections.includes(collection))
	);
}

/** A stock PDS drops a space grant it doesn't know, so this also says their PDS has spaces. A PDS
 *  hands `authority=self` back as the person's own DID, and leaves out `action` when it's all four. */
export function holdsHostGrant(scope: string, did: string): boolean {
	return calendarGrants(scope).some((grant) => {
		const authority = grant.get('authority') ?? 'self';
		const manage = grant.getAll('manage');
		return (
			(authority === 'self' || authority === did) &&
			['create', 'update', 'delete'].every((op) => manage.includes(op)) &&
			allowsRecords(grant, EVENT_COLLECTION) &&
			allowsRecords(grant, RSVP_COLLECTION)
		);
	});
}

export function holdsGuestGrant(scope: string): boolean {
	return calendarGrants(scope).some(
		(grant) => grant.get('authority') === '*' && allowsRecords(grant, RSVP_COLLECTION)
	);
}
