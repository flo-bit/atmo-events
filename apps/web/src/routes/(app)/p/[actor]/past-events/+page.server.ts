import { getActor } from '$lib/actor';
import { getProfileFromContrail, getServerClient } from '$lib/contrail';
import { pastEventsQuery } from '$lib/contrail/queries';
import { rawForQuery } from '$lib/contrail/cursor';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

export async function load({ params, url, platform }) {
	const client = getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	// Deep-link ?cursor= resumes only a 'past-events' cursor for this actor; else fresh page 1.
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'past-events', { actor });

	// The same query load-more continues, including its ended-event narrowing, so
	// this page can come back short while a cursor remains — see queries.ts.
	const [profile, page] = await Promise.all([
		getProfileFromContrail(client, actor),
		pastEventsQuery(client, { actor }, cursor)
	]);

	return {
		...page,
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
