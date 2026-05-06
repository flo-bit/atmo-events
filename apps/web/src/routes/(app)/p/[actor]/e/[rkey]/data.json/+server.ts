import { json, error } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import { getEventRecordFromContrail, getServerClient } from '$lib/contrail';

export async function GET({ params, platform }) {
	const client = getServerClient(platform!.env.DB);
	const did = await getActor(params.actor);

	if (!did || !params.rkey) {
		throw error(404, 'Event not found');
	}

	const eventRecord = await getEventRecordFromContrail(client, {
		did,
		rkey: params.rkey,
		hydrateRsvps: 50,
		profiles: true
	});

	if (!eventRecord) {
		throw error(404, 'Event not found');
	}

	return json(
		{
			...eventRecord,
			url: `https://atmo.rsvp/p/${params.actor}/e/${params.rkey}`
		},
		{
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET',
				'Cache-Control': 'public, max-age=60, s-maxage=60'
			}
		}
	);
}
