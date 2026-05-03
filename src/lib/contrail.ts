import '../lexicon-types/index.js';
import { getProfileUrl } from '$lib/atproto/profile-url';
import type { EventData } from '$lib/event-types';
import type {
	RsvpAtmoGetProfile,
	RsvpAtmoEventGetRecord,
	RsvpAtmoEventListRecords,
	RsvpAtmoRsvpListRecords
} from '../lexicon-types';
import type { Client } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons';

export { getServerClient } from '$lib/contrail/index';

export const RSVP_HYDRATE_LIMIT = 20;
export const RSVP_GOING = 'community.lexicon.calendar.rsvp#going';
export const RSVP_INTERESTED = 'community.lexicon.calendar.rsvp#interested';

type ProfileOutput = RsvpAtmoGetProfile.$output;
type EventListOutput = RsvpAtmoEventListRecords.$output;
type EventListRecord = RsvpAtmoEventListRecords.Record;
type EventProfileEntry = RsvpAtmoEventListRecords.ProfileEntry;
type EventGetOutput = RsvpAtmoEventGetRecord.$output;
type EventGetProfileEntry = RsvpAtmoEventGetRecord.ProfileEntry;
type RsvpListRecord = RsvpAtmoRsvpListRecords.Record;
type RsvpProfileEntry = RsvpAtmoRsvpListRecords.ProfileEntry;
type HydratedEventRecord = RsvpAtmoRsvpListRecords.RefEventRecord;
type FlattenableEventRecord = EventListRecord | EventGetOutput | HydratedEventRecord;
type EventProfiles = EventProfileEntry[] | EventGetProfileEntry[] | undefined;
type EventRsvps = EventListRecord['rsvps'] | EventGetOutput['rsvps'];

export type FlatEventRecord = EventData & {
	cid?: string | null;
	did: string;
	rkey: string;
	uri: string;
	/** Populated when the event was read from a permissioned space. */
	space?: string;
	rsvps?: EventRsvps;
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

export type EventAttendeesResult = {
	going: AttendeeInfo[];
	interested: AttendeeInfo[];
	goingCount: number;
	interestedCount: number;
};

export type ActivityCluster = {
	event: FlatEventRecord;
	attendees: AttendeeInfo[];
	latestTimeUs: number;
};

type ListEventsParams = {
	actor?: ActorIdentifier;
	search?: string;
	startsAtMin?: string;
	startsAtMax?: string;
	endsAtMin?: string;
	endsAtMax?: string;
	rsvpsGoingCountMin?: number;
	hydrateRsvps?: number;
	profiles?: boolean;
	preferencesShowInDiscovery?: string;
	sort?: string;
	order?: 'asc' | 'desc';
	limit?: number;
	cursor?: string;
};

function getBlobCid(blob: unknown): string | null {
	if (!blob || typeof blob !== 'object') return null;

	if ('ref' in blob) {
		const ref = (blob as { ref?: { $link?: string } }).ref;
		if (ref?.$link) return ref.$link;
	}

	if ('cid' in blob) {
		const cid = (blob as { cid?: { $link?: string } | string }).cid;
		if (typeof cid === 'string') return cid;
		if (cid && typeof cid === 'object' && '$link' in cid && typeof cid.$link === 'string') {
			return cid.$link;
		}
	}

	return null;
}

export function getProfileBlobUrl(did: string, blob: unknown) {
	const cid = getBlobCid(blob);
	if (!cid) return undefined;
	return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@webp`;
}

export function flattenEventRecord(record: FlattenableEventRecord): FlatEventRecord | null {
	if (!record.record?.startsAt) return null;

	return {
		...(record.record as EventData),
		cid: record.cid ?? null,
		did: record.did,
		rkey: record.rkey,
		uri: record.uri,
		...('space' in record && typeof record.space === 'string' ? { space: record.space } : {}),
		...('rsvps' in record ? { rsvps: record.rsvps } : {}),
		...('rsvpsCount' in record ? { rsvpsCount: record.rsvpsCount } : {}),
		...('rsvpsGoingCount' in record ? { rsvpsGoingCount: record.rsvpsGoingCount } : {}),
		...('rsvpsInterestedCount' in record
			? { rsvpsInterestedCount: record.rsvpsInterestedCount }
			: {}),
		...('rsvpsNotgoingCount' in record ? { rsvpsNotgoingCount: record.rsvpsNotgoingCount } : {})
	};
}

export function flattenEventRecords(records: EventListRecord[]): FlatEventRecord[] {
	return records
		.map((record) => flattenEventRecord(record))
		.filter((record): record is FlatEventRecord => record !== null);
}

/** Build the canonical path for an event. Private events (those with a `space`
 *  field from contrail's union) live under `/p/<actor>/e/<rkey>/s/<skey>` so
 *  the page knows both which event to show and which space to look in. Public
 *  events use `/p/<actor>/e/<rkey>`. */
export function eventUrl(event: FlatEventRecord, actor?: string): string {
	const who = actor || event.did;
	if (event.space) {
		const m = event.space.match(/^at:\/\/[^/]+\/[^/]+\/([^/]+)$/);
		const skey = m?.[1];
		if (skey) return `/p/${who}/e/${event.rkey}/s/${skey}`;
	}
	return `/p/${who}/e/${event.rkey}`;
}

export function getHostProfile(did: string, profiles?: EventProfiles): HostProfile | null {
	const profile = profiles?.find((entry) => entry.did === did);
	if (!profile) return null;

	return {
		did,
		handle: profile.handle,
		displayName: profile.record?.displayName,
		avatar: getProfileBlobUrl(did, profile.record?.avatar)
	};
}

export function buildAttendee(
	did: string,
	status: 'going' | 'interested',
	profiles?: EventProfiles | RsvpProfileEntry[]
): AttendeeInfo {
	const profile = profiles?.find((entry) => entry.did === did);
	const handle = profile?.handle;

	return {
		did,
		status,
		avatar: getProfileBlobUrl(did, profile?.record?.avatar),
		name: profile?.record?.displayName || handle || did,
		handle,
		url: getProfileUrl(handle || did)
	};
}

export function buildEventAttendees(
	rsvps?: EventRsvps,
	profiles?: EventProfiles,
	counts?: { goingCount?: number; interestedCount?: number }
): EventAttendeesResult {
	const going = (rsvps?.going ?? []).map((attendee) =>
		buildAttendee(attendee.did, 'going', profiles)
	);
	const interested = (rsvps?.interested ?? []).map((attendee) =>
		buildAttendee(attendee.did, 'interested', profiles)
	);

	return {
		going,
		interested,
		goingCount: counts?.goingCount ?? going.length,
		interestedCount: counts?.interestedCount ?? interested.length
	};
}

export function getRsvpStatus(status?: string): 'going' | 'interested' | 'notgoing' | null {
	if (!status) return null;
	if (status === RSVP_GOING || status.endsWith('#going')) return 'going';
	if (status === RSVP_INTERESTED || status.endsWith('#interested')) return 'interested';
	if (status.endsWith('#notgoing')) return 'notgoing';
	return null;
}

export function isEventOngoing(startsAt: string, endsAt?: string | null): boolean {
	if (!endsAt) return false;
	const now = new Date();
	return new Date(startsAt) <= now && new Date(endsAt) >= now;
}

/**
 * Client-side: notify contrail of a record update via the /xrpc/ proxy route.
 */
export async function notifyContrailOfUpdate(uri: string) {
	try {
		await fetch('/xrpc/rsvp.atmo.notifyOfUpdate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ uri })
		});
	} catch {
		// best-effort, don't block on failure
	}
}

export async function getProfileFromContrail(
	client: Client,
	actor: ActorIdentifier
): Promise<ProfileOutput['profiles'][number] | null> {
	const response = await client.get('rsvp.atmo.getProfile', {
		params: { actor }
	});

	if (!response.ok) return null;
	return response.data.profiles?.[0] ?? null;
}

export async function listEventRecordsFromContrail(
	client: Client,
	params: ListEventsParams
): Promise<EventListOutput | null> {
	const response = await client.get('rsvp.atmo.event.listRecords', {
		params
	});

	if (!response.ok) return null;
	return response.data;
}

/**
 * Hits the `listDiscoverable` pipelineQuery, which reuses the listRecords
 * pipeline but adds a WHERE condition excluding events where
 * `preferences.showInDiscovery === false`. Missing field is treated as true.
 * Response shape is identical to listRecords.
 */
export async function listDiscoverableEventsFromContrail(
	client: Client,
	params: Omit<ListEventsParams, 'preferencesShowInDiscovery'>
): Promise<EventListOutput | null> {
	const response = await client.get(
		'rsvp.atmo.event.listDiscoverable' as 'rsvp.atmo.event.listRecords',
		{ params }
	);

	if (!response.ok) return null;
	return response.data;
}

export async function getEventRecordFromContrail(
	client: Client,
	{
		did,
		rkey,
		hydrateRsvps,
		profiles
	}: {
		did: string;
		rkey: string;
		hydrateRsvps?: number;
		profiles?: boolean;
	}
): Promise<EventGetOutput | null> {
	const response = await client.get('rsvp.atmo.event.getRecord', {
		params: {
			uri: `at://${did}/community.lexicon.calendar.event/${rkey}`,
			...(hydrateRsvps ? { hydrateRsvps } : {}),
			...(profiles ? { profiles } : {})
		}
	});

	if (!response.ok) return null;
	return response.data;
}

export async function getViewerRsvpFromContrail(
	client: Client,
	{
		eventUri,
		actor
	}: {
		eventUri: string;
		actor: ActorIdentifier;
	}
): Promise<RsvpListRecord | null> {
	const response = await client.get('rsvp.atmo.rsvp.listRecords', {
		params: {
			actor,
			subjectUri: eventUri,
			limit: 1
		}
	});

	if (!response.ok) return null;
	return (response.data.records ?? [])[0] ?? null;
}

export async function listEventAttendeesFromContrail(
	client: Client,
	eventUri: string
): Promise<EventAttendeesResult> {
	const [goingResponse, interestedResponse] = await Promise.all([
		client.get('rsvp.atmo.rsvp.listRecords', {
			params: {
				subjectUri: eventUri,
				status: RSVP_GOING,
				profiles: true,
				limit: 200
			}
		}),
		client.get('rsvp.atmo.rsvp.listRecords', {
			params: {
				subjectUri: eventUri,
				status: RSVP_INTERESTED,
				profiles: true,
				limit: 200
			}
		})
	]);

	const goingRecords = goingResponse.ok ? (goingResponse.data.records ?? []) : [];
	const interestedRecords = interestedResponse.ok ? (interestedResponse.data.records ?? []) : [];
	const goingProfiles = goingResponse.ok ? (goingResponse.data.profiles ?? []) : [];
	const interestedProfiles = interestedResponse.ok ? (interestedResponse.data.profiles ?? []) : [];

	// Deduplicate by DID (keep first occurrence)
	const seenGoing = new Set<string>();
	const uniqueGoing = goingRecords.filter((r) => {
		if (seenGoing.has(r.did)) return false;
		seenGoing.add(r.did);
		return true;
	});
	const seenInterested = new Set<string>();
	const uniqueInterested = interestedRecords.filter((r) => {
		if (seenInterested.has(r.did)) return false;
		seenInterested.add(r.did);
		return true;
	});

	return {
		going: uniqueGoing.map((record) => buildAttendee(record.did, 'going', goingProfiles)),
		interested: uniqueInterested.map((record) =>
			buildAttendee(record.did, 'interested', interestedProfiles)
		),
		goingCount: uniqueGoing.length,
		interestedCount: uniqueInterested.length
	};
}

export async function listAttendingEventsFromContrail(client: Client, actor: ActorIdentifier) {
	const response = await client.get('rsvp.atmo.rsvp.listRecords', {
		params: {
			actor,
			hydrateEvent: true,
			limit: 100
		}
	});

	if (!response.ok) return [];

	const seen = new Set<string>();
	return (response.data.records ?? [])
		.filter((record) => {
			const status = record.record?.status;
			return status?.endsWith('#going') || status?.endsWith('#interested');
		})
		.flatMap((record) => {
			if (!record.event) return [];
			const flatEvent = flattenEventRecord(record.event);
			if (!flatEvent || seen.has(flatEvent.uri)) return [];
			seen.add(flatEvent.uri);
			return [flatEvent];
		});
}
