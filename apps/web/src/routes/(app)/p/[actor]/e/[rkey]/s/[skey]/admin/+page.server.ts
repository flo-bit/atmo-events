import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getActor } from '$lib/actor';
import { listMembers, listInvites } from '$lib/spaces/server/spaces.remote';
import { SPACE_TYPE } from '$lib/spaces/config';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.did) redirect(303, '/login');

	const ownerDid = await getActor(params.actor);
	if (!ownerDid) throw error(404, 'Not found');
	if (ownerDid !== locals.did) throw error(403, 'Only the host can manage this event');

	const spaceUri = `ats://${ownerDid}/${SPACE_TYPE}/${params.skey}`;

	const [members, invites] = await Promise.all([
		listMembers({ spaceUri }).catch(() => []),
		listInvites({ spaceUri }).catch(() => [])
	]);

	return {
		spaceUri,
		actor: params.actor,
		rkey: params.rkey,
		spaceKey: params.skey,
		members,
		invites
	};
};
