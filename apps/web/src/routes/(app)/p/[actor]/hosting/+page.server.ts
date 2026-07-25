import { getActor } from '$lib/actor';
import { getProfileFromContrail, getServerClient } from '$lib/contrail';
import { hostingQuery } from '$lib/contrail/queries';
import { rawForQuery } from '$lib/contrail/cursor';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

export async function load({ params, url, platform }) {
	const client = getServerClient(platform!.env.DB);
	if (!isActorIdentifier(params.actor)) return;

	const actor = params.actor;
	const did = await getActor(actor);

	if (!did) throw error(404, 'Actor not found');

	// Deep-link ?cursor= resumes only a 'hosting' cursor for this actor; else fresh page 1.
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'hosting', { actor });

	// The same query load-more continues — see queries.ts.
	const [profile, page] = await Promise.all([
		getProfileFromContrail(client, actor),
		hostingQuery(client, { actor }, cursor)
	]);

	return {
		...page,
		actorProfile: profile,
		actor,
		actorDid: did
	};
}
