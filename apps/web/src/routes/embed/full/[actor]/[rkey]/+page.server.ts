import { error } from '@sveltejs/kit';
import type { ActorIdentifier } from '@atcute/lexicons';
import { getActor } from '$lib/actor';
import {
	flattenEventRecord,
	getEventRecordFromContrail,
	getHostProfile,
	getProfileBlobUrl,
	getProfileFromContrail,
	getRsvpStatus,
	getServerClient,
	getViewerRsvpFromContrail,
	listEventAttendeesFromContrail,
	RSVP_HYDRATE_LIMIT
} from '$lib/contrail';
import { vodFromAtUri } from '$lib/vods';

export async function load({ params, url, platform }) {
	const client = getServerClient(platform!.env.DB);
	const { rkey } = params;
	const did = await getActor(params.actor);

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}

	try {
		const eventRecord = await getEventRecordFromContrail(client, {
			did,
			rkey,
			hydrateRsvps: RSVP_HYDRATE_LIMIT,
			profiles: true
		});

		const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;
		if (!eventData) throw error(404, 'Event not found');

		const fullEventRecord = eventRecord!;
		const isAtmosphereconf = !!(eventData.additionalData as Record<string, unknown> | undefined)
			?.isAtmosphereconf;
		const speakers =
			((eventData.additionalData as Record<string, unknown> | undefined)?.speakers as
				| Array<{ id: string; name: string }>
				| undefined) ?? [];
		const vodAtUri = (eventData.additionalData as Record<string, unknown> | undefined)
			?.vodAtUri as string | undefined;
		const vod = vodAtUri ? vodFromAtUri(vodAtUri) : null;

		const viewerDid = url.searchParams.get('did') ?? null;

		const [attendees, viewerRsvpRecord, parentEvent, ...speakerProfiles] = await Promise.all([
			listEventAttendeesFromContrail(client, fullEventRecord.uri),
			viewerDid
				? getViewerRsvpFromContrail(client, {
						eventUri: fullEventRecord.uri,
						actor: viewerDid as ActorIdentifier
					})
				: null,
			isAtmosphereconf
				? getEventRecordFromContrail(client, {
						did: 'did:plc:lehcqqkwzcwvjvw66uthu5oq',
						rkey: '3lte3c7x43l2e',
						profiles: true
					})
						.then((r) => (r ? flattenEventRecord(r) : null))
						.catch(() => null)
				: null,
			...speakers.map((s) =>
				s.id
					? getProfileFromContrail(client, s.id as ActorIdentifier)
							.then((p) => ({
								id: s.id,
								name: s.name,
								avatar: p?.value?.avatar ? getProfileBlobUrl(p.did, p.value.avatar) : undefined,
								handle: p?.handle || s.id
							}))
							.catch(() => ({ id: s.id, name: s.name, avatar: undefined, handle: s.id }))
					: Promise.resolve({ id: undefined, name: s.name, avatar: undefined, handle: undefined })
			)
		]);

		return {
			ogImage: `${url.origin}/p/${params.actor}/e/${rkey}/og.png`,
			eventData,
			actorDid: did,
			rkey,
			hostProfile: getHostProfile(did, fullEventRecord.profiles) ?? null,
			attendees,
			viewerRsvpStatus: getRsvpStatus(viewerRsvpRecord?.value?.status),
			viewerRsvpRkey: viewerRsvpRecord?.rkey ?? null,
			parentEvent,
			vod,
			speakerProfiles: speakerProfiles as Array<{
				id?: string;
				name: string;
				avatar?: string;
				handle?: string;
			}>
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
