import type { PageServerLoad } from './$types';
import type { Did, ActorIdentifier } from '@atcute/lexicons';
import { getActor } from '$lib/actor';
import {
	flattenEventRecord,
	getProfileFromContrail,
	getProfileBlobUrl,
	getServerClient,
	type FlatEventRecord,
	type HostProfile
} from '$lib/contrail';
import { getPrivateSpace } from '$lib/spaces/server/spaces.remote';
import { SPACE_TYPE } from '$lib/spaces/config';

export const load: PageServerLoad = async ({ params, locals, platform, url }) => {
	const ownerDid = await getActor(params.actor);
	if (!ownerDid) {
		return { authState: 'not-found' as const };
	}

	const spaceUri = `ats://${ownerDid}/${SPACE_TYPE}/${params.skey}`;
	const inviteToken = url.searchParams.get('invite') ?? undefined;
	const hasInvite = inviteToken != null;

	// Anonymous viewer with a `?invite=...` token: try to read the space using
	// the bearer-token path (works only for `read` / `read-join` invites). On
	// success we render the event in read-only mode; on failure we drop back to
	// the standard auth flow (anon prompt or pending-invite redeem).
	if (!locals.did) {
		if (!hasInvite) return { authState: 'anon' as const };
		const anon = await loadByInviteToken(
			platform!.env.DB,
			spaceUri,
			inviteToken!,
			ownerDid,
			params.actor,
			params.rkey
		);
		if (anon) return anon;
		return { authState: 'anon' as const };
	}

	const spaceResult = await getPrivateSpace({ spaceUri }).catch((e) => {
		console.error('[private-event-load] getPrivateSpace threw unexpectedly:', e);
		return { ok: false as const, status: 500 };
	});
	if (!spaceResult.ok) {
		if (hasInvite) return { authState: 'pending-invite' as const };
		return { authState: 'no-access' as const };
	}
	const spaceData = spaceResult;

	// Find the specific event this URL is for, not just the first one in the space.
	// Supports spaces that hold multiple events (future) without breaking existing
	// links when a space has a single event.
	const stored = spaceData.events.find((e) => e.rkey === params.rkey);
	if (!stored) {
		return { authState: 'no-access' as const };
	}

	const synthesizedRecord = {
		record: stored.record as Record<string, unknown>,
		cid: stored.cid ?? null,
		did: stored.authorDid,
		rkey: stored.rkey,
		uri: `at://${stored.authorDid}/${stored.collection}/${stored.rkey}`,
		space: spaceUri
	};
	const eventData = flattenEventRecord(synthesizedRecord as never) as FlatEventRecord | null;
	if (!eventData) {
		return { authState: 'no-access' as const };
	}

	const client = getServerClient(platform!.env.DB);
	let hostProfile: HostProfile | null = null;
	try {
		const p = await getProfileFromContrail(client, ownerDid as ActorIdentifier);
		if (p) {
			hostProfile = {
				did: p.did,
				handle: p.handle && p.handle !== 'handle.invalid' ? p.handle : ownerDid,
				displayName: p.value?.displayName,
				avatar: p.value?.avatar ? getProfileBlobUrl(p.did, p.value.avatar) : undefined
			};
		}
	} catch {
		// best-effort
	}

	const rsvps = (spaceData.rsvps ?? []) as Array<{
		authorDid: string;
		rkey: string;
		record: { status?: string; createdAt?: string; subject?: { uri?: string } };
	}>;
	const going: Array<{ did: string; rkey: string; createdAt?: string }> = [];
	const interested: Array<{ did: string; rkey: string; createdAt?: string }> = [];
	let viewerRsvpStatus: 'going' | 'interested' | 'notgoing' | null = null;
	let viewerRsvpRkey: string | null = null;

	for (const r of rsvps) {
		const statusFull = r.record?.status ?? '';
		const shortStatus = statusFull.split('#')[1] as 'going' | 'interested' | 'notgoing' | undefined;
		if (shortStatus === 'going')
			going.push({ did: r.authorDid, rkey: r.rkey, createdAt: r.record?.createdAt });
		else if (shortStatus === 'interested')
			interested.push({ did: r.authorDid, rkey: r.rkey, createdAt: r.record?.createdAt });
		if (r.authorDid === locals.did && shortStatus) {
			viewerRsvpStatus = shortStatus;
			viewerRsvpRkey = r.rkey;
		}
	}

	const attendeeDids = Array.from(new Set([...going, ...interested].map((a) => a.did)));
	const profileMap = new Map<string, HostProfile>();
	await Promise.all(
		attendeeDids.map(async (did) => {
			try {
				const p = await getProfileFromContrail(client, did as ActorIdentifier);
				if (p) {
					profileMap.set(did, {
						did: p.did,
						handle: p.handle && p.handle !== 'handle.invalid' ? p.handle : did,
						displayName: p.value?.displayName,
						avatar: p.value?.avatar ? getProfileBlobUrl(p.did, p.value.avatar) : undefined
					});
				}
			} catch {
				/* best-effort */
			}
		})
	);

	const shapeAttendee = (a: { did: string; rkey: string; createdAt?: string }) => {
		const p = profileMap.get(a.did);
		return {
			did: a.did,
			rkey: a.rkey,
			handle: p?.handle ?? a.did,
			displayName: p?.displayName,
			avatar: p?.avatar,
			createdAt: a.createdAt
		};
	};

	return {
		authState: 'member' as const,
		ownerDid: ownerDid as Did,
		spaceUri,
		spaceKey: params.skey,
		isOwner: ownerDid === locals.did,
		eventData,
		actorDid: ownerDid,
		rkey: params.rkey,
		hostProfile,
		attendees: {
			going: going.map(shapeAttendee),
			interested: interested.map(shapeAttendee),
			goingCount: going.length,
			interestedCount: interested.length
		},
		viewerRsvpStatus,
		viewerRsvpRkey,
		parentEvent: null,
		vod: null,
		speakerProfiles: [] as Array<{ id?: string; name: string; avatar?: string; handle?: string }>,
		ogImage: undefined as string | undefined
	};
};

/** Anonymous read using a `read` / `read-join` invite token. Hits the spaces
 *  XRPCs through the in-process server client with `inviteToken=...` instead
 *  of a service-auth JWT. Returns the page data on success, or null if the
 *  token is invalid/expired/revoked or the event isn't in the space. */
async function loadByInviteToken(
	db: D1Database,
	spaceUri: string,
	inviteToken: string,
	ownerDid: string,
	_actor: string,
	eventRkey: string
) {
	const client = getServerClient(db);
	const spaceUriParam = spaceUri as unknown as import('@atcute/lexicons').ResourceUri;

	const [spaceRes, eventsRes, rsvpsRes] = await Promise.all([
		client.get('rsvp.atmo.space.getSpace', {
			params: { uri: spaceUriParam, inviteToken }
		}),
		client.get('rsvp.atmo.space.listRecords', {
			params: {
				spaceUri: spaceUriParam,
				collection: 'community.lexicon.calendar.event' as `${string}.${string}.${string}`,
				inviteToken
			}
		}),
		client.get('rsvp.atmo.space.listRecords', {
			params: {
				spaceUri: spaceUriParam,
				collection: 'community.lexicon.calendar.rsvp' as `${string}.${string}.${string}`,
				inviteToken
			}
		})
	]);

	if (!spaceRes.ok || !eventsRes.ok) return null;

	const events = (eventsRes.data.records ?? []) as Array<{
		authorDid: string;
		rkey: string;
		cid?: string | null;
		collection: string;
		record: Record<string, unknown>;
	}>;
	const stored = events.find((e) => e.rkey === eventRkey);
	if (!stored) return null;

	const eventData = flattenEventRecord({
		record: stored.record,
		cid: stored.cid ?? null,
		did: stored.authorDid,
		rkey: stored.rkey,
		uri: `at://${stored.authorDid}/${stored.collection}/${stored.rkey}`,
		space: spaceUri
	} as never) as FlatEventRecord | null;
	if (!eventData) return null;

	const rsvps = (rsvpsRes.ok ? rsvpsRes.data.records ?? [] : []) as Array<{
		authorDid: string;
		rkey: string;
		record: { status?: string; createdAt?: string };
	}>;

	// Resolve profiles for host + RSVP authors via the public profile endpoint
	// (no auth needed). Without this, attendees show as bare DIDs.
	const profileDids = Array.from(new Set([ownerDid, ...rsvps.map((r) => r.authorDid)]));
	const profileMap = new Map<string, HostProfile>();
	await Promise.all(
		profileDids.map(async (d) => {
			try {
				const p = await getProfileFromContrail(client, d as ActorIdentifier);
				if (p) {
					profileMap.set(d, {
						did: p.did,
						handle: p.handle && p.handle !== 'handle.invalid' ? p.handle : d,
						displayName: p.value?.displayName,
						avatar: p.value?.avatar ? getProfileBlobUrl(p.did, p.value.avatar) : undefined
					});
				}
			} catch {
				/* best-effort */
			}
		})
	);

	const hostProfile = profileMap.get(ownerDid) ?? null;

	const shapeAttendee = (a: { did: string; rkey: string; createdAt?: string }) => {
		const p = profileMap.get(a.did);
		return {
			did: a.did,
			rkey: a.rkey,
			handle: p?.handle ?? a.did,
			displayName: p?.displayName,
			avatar: p?.avatar,
			createdAt: a.createdAt
		};
	};

	const going: Array<{ did: string; rkey: string; createdAt?: string }> = [];
	const interested: Array<{ did: string; rkey: string; createdAt?: string }> = [];
	for (const r of rsvps) {
		const short = r.record?.status?.split('#')[1];
		if (short === 'going')
			going.push({ did: r.authorDid, rkey: r.rkey, createdAt: r.record?.createdAt });
		else if (short === 'interested')
			interested.push({ did: r.authorDid, rkey: r.rkey, createdAt: r.record?.createdAt });
	}

	return {
		authState: 'member' as const,
		ownerDid: ownerDid as Did,
		spaceUri,
		spaceKey: spaceUri.split('/').pop() ?? '',
		isOwner: false,
		eventData,
		actorDid: ownerDid,
		rkey: eventRkey,
		hostProfile,
		attendees: {
			going: going.map(shapeAttendee),
			interested: interested.map(shapeAttendee),
			goingCount: going.length,
			interestedCount: interested.length
		},
		viewerRsvpStatus: null as 'going' | 'interested' | 'notgoing' | null,
		viewerRsvpRkey: null as string | null,
		parentEvent: null,
		vod: null,
		speakerProfiles: [] as Array<{ id?: string; name: string; avatar?: string; handle?: string }>,
		ogImage: undefined as string | undefined,
		viaInviteToken: true
	};
}
