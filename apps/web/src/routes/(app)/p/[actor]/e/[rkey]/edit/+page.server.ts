import { error } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import { flattenEventRecord, getEventRecordFromContrail, getServerClient } from '$lib/contrail';

export async function load({ params, platform }) {
	const client = getServerClient(platform!.env.DB);
	const { rkey } = params;

	const did = await getActor(params.actor);

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}

	try {
		const eventRecord = await getEventRecordFromContrail(client, { did, rkey }).catch(() => null);
		const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;

		if (!eventData) {
			return {
				eventData: null,
				actorDid: did,
				rkey
			};
		}

		return {
			eventData,
			actorDid: did,
			rkey
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
