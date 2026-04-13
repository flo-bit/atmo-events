import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		redirect(303, '/login');
	}
	return { actorDid: locals.did };
};
