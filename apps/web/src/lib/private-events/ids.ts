// A person's private event: one space per event, held on their own PDS, with the event's key as
// the space's key. Values only, so the OAuth config and the pages can import them.
import { spaceRecordUri, spaceUri } from '#lib/spaces/uri.js';

/** It is in every URI in the space, so a rename strands what was written under the old name, and
 *  it must resolve wherever a scope names it. For now this is atmo.rsvp's published type for
 *  development and testing, until a lasting name is published. */
export const PRIVATE_CALENDAR_TYPE = 'rsvp.atmo.dev.space';
export const EVENT_COLLECTION = 'community.lexicon.calendar.event';
export const RSVP_COLLECTION = 'community.lexicon.calendar.rsvp';

/** The lexicon's `status` token suffixes. */
export const RSVP_STATUSES = ['going', 'interested', 'notgoing'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export function privateEventSpace(host: string, rkey: string): string {
	return spaceUri(host, PRIVATE_CALENDAR_TYPE, rkey);
}

/** The host's own record in the space: the URI an RSVP to the event names. */
export function privateEventUri(host: string, rkey: string): string {
	return spaceRecordUri(privateEventSpace(host, rkey), host, EVENT_COLLECTION, rkey);
}

/** An event's own page, by handle when there is one. */
export function privateEventPath(hostHandleOrDid: string, rkey: string): string {
	return `/p/${encodeURIComponent(hostHandleOrDid)}/private/${encodeURIComponent(rkey)}`;
}
