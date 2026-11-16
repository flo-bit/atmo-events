// A person's private events, each in a space on their own PDS. Values only, so the OAuth config and
// the pages can import them.
import { spaceRecordUri, spaceUri } from '#lib/spaces/uri.js';

/** It is in every URI in the space, so a rename strands what was written under the old name, and
 *  it must resolve wherever a scope names it. Lexicon Community's shared calendar type, so other
 *  calendar apps can read the same spaces and their guests can answer from them. */
export const PRIVATE_CALENDAR_TYPE = 'community.lexicon.calendar.collection';
export const EVENT_COLLECTION = 'community.lexicon.calendar.event';
export const RSVP_COLLECTION = 'community.lexicon.calendar.rsvp';

/** The lexicon's `status` token suffixes. */
export const RSVP_STATUSES = ['going', 'interested', 'notgoing'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const ANSWER_WORDS: Record<RsvpStatus, string> = {
	going: 'Going',
	interested: 'Interested',
	notgoing: 'Not going'
};

/** Where an event is: its host, the key of the space it is kept in, and its own key. */
export interface EventAddress {
	host: string;
	spaceKey: string;
	rkey: string;
}

/** An event with a space of its own, which has the event's key, so each one has its own guests. */
export function singleEvent(host: string, rkey: string): EventAddress {
	return { host, spaceKey: rkey, rkey };
}

/** The space a host keeps under this key. */
export function privateEventSpace(host: string, spaceKey: string): string {
	return spaceUri(host, PRIVATE_CALENDAR_TYPE, spaceKey);
}

export function eventSpace(address: EventAddress): string {
	return privateEventSpace(address.host, address.spaceKey);
}

/** The host's own record in the space: the URI an RSVP to the event names. */
export function eventUri(address: EventAddress): string {
	return spaceRecordUri(eventSpace(address), address.host, EVENT_COLLECTION, address.rkey);
}

/** An event's own page, by handle when there is one. */
export function privateEventPath(hostHandleOrDid: string, rkey: string): string {
	return `/p/${encodeURIComponent(hostHandleOrDid)}/private/${encodeURIComponent(rkey)}`;
}
