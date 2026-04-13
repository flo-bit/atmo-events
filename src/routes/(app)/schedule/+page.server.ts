import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMySchedulingRequests, getParticipantCount } from '$lib/scheduling/db';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.did) {
		redirect(303, '/login');
	}

	const db = platform!.env.DB;
	const requests = await listMySchedulingRequests(db, locals.did);

	// get participant counts for each
	const counts: Record<string, number> = {};
	for (const req of requests) {
		counts[req.id] = await getParticipantCount(db, req.id);
	}

	return {
		requests,
		counts,
		myDid: locals.did
	};
};
