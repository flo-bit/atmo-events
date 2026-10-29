import { env } from 'cloudflare:workers';
import { json, error } from '@sveltejs/kit';
import { getActor } from '#lib/actor.js';
import { getEventRecordFromContrail } from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';

export async function GET({ params }) {
	const client = getServerClient(env.DB);
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
				'Cache-Control': 'no-store'
			}
		}
	);
}
