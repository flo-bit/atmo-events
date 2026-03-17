import { getActor } from '$lib/actor';
import { Client, simpleFetchHandler } from '@atcute/client';
import { isActorIdentifier, type Did } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

const contrail = new Client({
	handler: simpleFetchHandler({ service: 'https://contrail.atmo.tools' })
});

export async function load({ params }) {
	const now = new Date().toISOString();

	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	const response = await contrail.get('community.lexicon.calendar.event.listRecords', {
		params: {
			startsAtMin: now,
			hydrateRsvps: 5,
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			actor: actor,
			limit: 50
		}
	});

	if (!response.ok) return { events: [], profiles: {}, actor, did };

	return {
		events: response.data.records,
		profiles: Object.fromEntries(response.data.profiles?.map((p) => [p.did, p]) ?? []) ?? [],
		actor,
		did
	};
}
