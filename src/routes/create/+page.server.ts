import { redirect } from '@sveltejs/kit';
import { now as tidNow } from '@atcute/tid';

export async function load({ locals }) {
	if (!locals.did) {
		redirect(303, '/login');
	}

	return {
		actorDid: locals.did,
		rkey: tidNow()
	};
}
