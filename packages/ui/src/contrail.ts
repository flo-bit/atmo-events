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

export function eventUrl(event: FlatEventRecord, actor?: string): string {
	return `/p/${actor || event.did}/e/${event.rkey}`;
}

export function isEventOngoing(startsAt: string, endsAt?: string | null): boolean {
	if (!endsAt) return false;
	const now = new Date();
	return new Date(startsAt) <= now && new Date(endsAt) >= now;
}
