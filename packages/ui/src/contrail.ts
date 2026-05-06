import type { EventData } from './event-types.js';

/**
 * Subset of contrail types and helpers needed by the UI package. Server-side
 * functions (notifyContrailOfUpdate, listEventRecordsFromContrail, etc.) live
 * in the consumer app, not here.
 */

export type FlatEventRecord = EventData & {
	cid?: string | null;
	did: string;
	rkey: string;
	uri: string;
	/** Populated when the event was read from a permissioned space. */
	space?: string;
	rsvps?: {
		going?: Array<{ did: string; createdAt?: string }>;
		interested?: Array<{ did: string; createdAt?: string }>;
		notgoing?: Array<{ did: string; createdAt?: string }>;
	};
	rsvpsCount?: number;
	rsvpsGoingCount?: number;
	rsvpsInterestedCount?: number;
	rsvpsNotgoingCount?: number;
};

export type HostProfile = {
	did: string;
	handle?: string;
	displayName?: string;
	avatar?: string;
};

export type AttendeeInfo = {
	did: string;
	status: 'going' | 'interested';
	avatar?: string;
	name: string;
	handle?: string;
	url: string;
};

export const RSVP_GOING = 'community.lexicon.calendar.rsvp#going';
export const RSVP_INTERESTED = 'community.lexicon.calendar.rsvp#interested';

/** Build the canonical path for an event. Private events (those with a `space`
 *  field) live under `/p/<actor>/e/<rkey>/s/<skey>` so the page knows both
 *  which event to show and which space to look in. Public events use
 *  `/p/<actor>/e/<rkey>`. */
export function eventUrl(event: FlatEventRecord, actor?: string): string {
	const who = actor || event.did;
	if (event.space) {
		const m = event.space.match(/^ats?:\/\/[^/]+\/[^/]+\/([^/]+)$/);
		const skey = m?.[1];
		if (skey) return `/p/${who}/e/${event.rkey}/s/${skey}`;
	}
	return `/p/${who}/e/${event.rkey}`;
}

export function isEventOngoing(startsAt: string, endsAt?: string | null): boolean {
	if (!endsAt) return false;
	const now = new Date();
	return new Date(startsAt) <= now && new Date(endsAt) >= now;
}
