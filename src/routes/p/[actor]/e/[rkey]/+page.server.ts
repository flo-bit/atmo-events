import { error } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import {
	flattenEventRecord,
	getEventRecordFromContrail,
	getHostProfile,
	getRsvpStatus,
	getViewerRsvpFromContrail,
	listEventAttendeesFromContrail,
	RSVP_HYDRATE_LIMIT
} from '$lib/contrail';

export async function load({ params, locals }) {
	const { rkey } = params;

	const did = await getActor(params.actor);

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}

	try {
		const eventRecord = await getEventRecordFromContrail({
			did,
			rkey,
			hydrateRsvps: RSVP_HYDRATE_LIMIT,
			profiles: true
		});

		const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;

		if (!eventData) {
			throw error(404, 'Event not found');
		}

		const fullEventRecord = eventRecord!;
		const [attendees, viewerRsvpRecord] = await Promise.all([
			listEventAttendeesFromContrail(fullEventRecord.uri),
			locals.did
				? getViewerRsvpFromContrail({ eventUri: fullEventRecord.uri, actor: locals.did })
				: null
		]);

		return {
			eventData,
			actorDid: did,
			rkey,
			hostProfile: getHostProfile(did, fullEventRecord.profiles) ?? null,
			attendees,
			viewerRsvpStatus: getRsvpStatus(viewerRsvpRecord?.record?.status),
			viewerRsvpRkey: viewerRsvpRecord?.rkey ?? null
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
