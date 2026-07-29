import { getActor } from '$lib/actor';
import { getProfileFromContrail, getServerClient } from '$lib/contrail';
import { hostingQuery } from '$lib/contrail/queries';
import { ongoingQuery, withOngoing } from '$lib/contrail/ongoing';
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

	// This page is the DESTINATION of the shared lists' "see all" overflow link, so
	// its band is UNCAPPED — a per-actor cap here would send a reader looking for
	// the rest of a publisher's live events to a page showing the same one card.
	//
	// It also closes the symptom on its own terms: before this, a host's own
	// profile showed the event they were running today in neither section —
	// `hostingQuery` bounds on `startsAtMin: now` and past-events narrows with
	// hasEnded(). Page 1 only, as on /events.
	const [profile, page] = await Promise.all([
		getProfileFromContrail(client, actor),
		hostingQuery(client, { actor }, cursor)
	]);

	return withOngoing(
		{ ...page, actorProfile: profile, actor, actorDid: did },
		cursor ? null : ongoingQuery(client, { actor })
	);
}
