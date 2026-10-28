import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { getActor } from '#lib/actor.js';
import { flattenEventRecord, getEventRecordFromContrail } from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';

export async function load({ params }) {
	const client = getServerClient(env.DB);
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
				pageTitle: 'Edit Event',
				eventData: null,
				actorDid: did,
				rkey
			};
		}

		return {
			pageTitle: 'Edit Event',
			eventData,
			actorDid: did,
			rkey
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
