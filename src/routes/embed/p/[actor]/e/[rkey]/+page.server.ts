import { error } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import {
	flattenEventRecord,
	getEventRecordFromContrail,
	getHostProfile,
	getRsvpStatus,
	getServerClient,
	getViewerRsvpFromContrail
} from '$lib/contrail';
import type { ActorIdentifier } from '@atcute/lexicons';

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
			profiles: true
		});

		const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;

		if (!eventData) {
			throw error(404, 'Event not found');
		}

		const viewerDid = url.searchParams.get('did');

		const viewerRsvpRecord = viewerDid
			? await getViewerRsvpFromContrail(client, {
					eventUri: eventRecord!.uri,
					actor: viewerDid as ActorIdentifier
				})
			: null;

		const hostProfile = getHostProfile(did, eventRecord!.profiles) ?? null;

		// Compute thumbnail URL server-side
		let thumbnailUrl: string | null = null;
		if (eventData.media && eventData.media.length > 0) {
			const thumb = eventData.media.find((m: any) => m.role === 'thumbnail');
			if (thumb?.content?.ref?.$link) {
				thumbnailUrl = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${thumb.content.ref.$link}@webp`;
			}
		}

		return {
			eventData,
			actorDid: did,
			rkey,
			eventUri: eventRecord!.uri,
			eventCid: eventData.cid ?? null,
			hostProfile,
			thumbnailUrl,
			viewerDid,
			viewerRsvpStatus: getRsvpStatus(viewerRsvpRecord?.record?.status),
			viewerRsvpRkey: viewerRsvpRecord?.rkey ?? null
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
