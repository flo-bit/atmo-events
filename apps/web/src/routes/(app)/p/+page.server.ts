import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.did) {
		redirect(303, '/login');
	}

	const { profile } = await parent();
	const actor = profile?.handle ?? locals.did;

	redirect(303, `/p/${actor}`);
};
