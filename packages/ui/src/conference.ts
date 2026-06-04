/**
 * Conference / multi-event grouping.
 *
 * A "conference" is an ordinary calendar event whose `additionalData.type` is
 * `'conference'`. Individual talks are ordinary calendar events too, each
 * carrying `additionalData.parentEvent` pointing back at the conference. This
 * keeps everything inside the shared `community.lexicon.calendar.event` lexicon
 * (no fork) while giving every talk its own page, OG image and RSVP for free.
 *
 * All conference-specific metadata lives under `additionalData`:
 *   conference: { type: 'conference', rooms?: string[] }
 *   talk:       { type, parentEvent: { uri, cid? }, room?, speakers? }
 */
import type { FlatEventRecord } from './contrail.js';

export interface ParentEventRef {
	uri: string;
	cid?: string;
}

/** A talk normalized for the schedule grid. */
export interface ScheduleEvent {
	rkey: string;
	title: string;
	type: string;
	speakers?: Array<{ id?: string; name: string }>;
	start: string;
	end?: string;
	room?: string;
	description?: string;
	did: string;
	uri: string;
	cid?: string | null;
}

/** Talk types that link through to their own event page (vs. static info rows). */
export const linkableTalkTypes = new Set([
	'talk',
	'presentation',
	'workshop',
	'lightning-talk',
	'panel'
]);

function additional(event: { additionalData?: unknown }): Record<string, unknown> {
	return (event.additionalData ?? {}) as Record<string, unknown>;
}

export function getEventType(event: { additionalData?: unknown }): string | undefined {
	return additional(event).type as string | undefined;
}

export function isConferenceEvent(event: { additionalData?: unknown }): boolean {
	return getEventType(event) === 'conference';
}

export function getParentEventRef(event: { additionalData?: unknown }): ParentEventRef | undefined {
	const p = additional(event).parentEvent as ParentEventRef | undefined;
	return p?.uri ? p : undefined;
}

/** Explicit room ordering declared on the conference event, if any. */
export function getConferenceRooms(event: { additionalData?: unknown }): string[] | undefined {
	const r = additional(event).rooms;
	return Array.isArray(r) && r.every((x) => typeof x === 'string') ? (r as string[]) : undefined;
}

/**
 * Parse an `at://did/community.lexicon.calendar.event/rkey` URI into its parts.
 * Returns null for anything that isn't a calendar-event AT-URI.
 */
export function parseEventUri(uri: string): { did: string; rkey: string } | null {
	const m = /^at:\/\/([^/]+)\/community\.lexicon\.calendar\.event\/([^/]+)$/.exec(uri);
	return m ? { did: m[1], rkey: m[2] } : null;
}

/**
 * Normalize the talk records belonging to `conferenceUri` into ScheduleEvents,
 * sorted by start time. Records whose `parentEvent.uri` doesn't match are
 * dropped, so it's safe to pass an over-broad list.
 */
export function toScheduleEvents(
	events: FlatEventRecord[],
	conferenceUri: string
): ScheduleEvent[] {
	return events
		.filter((e) => getParentEventRef(e)?.uri === conferenceUri)
		.map((e) => {
			const ad = additional(e);
			return {
				rkey: e.rkey,
				title: e.name,
				type: (ad.type as string) ?? 'talk',
				speakers: ad.speakers as Array<{ id?: string; name: string }> | undefined,
				start: e.startsAt,
				end: e.endsAt,
				room: ad.room as string | undefined,
				description: e.description,
				did: e.did,
				uri: e.uri,
				cid: e.cid
			} satisfies ScheduleEvent;
		})
		.sort((a, b) => a.start.localeCompare(b.start));
}
