import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadProfile } from '$lib/atproto/server/profile';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.did) {
		redirect(303, '/login');
	}

	const profile = await loadProfile(locals.did, platform?.env?.PROFILE_CACHE);
	const actor =
		typeof profile?.handle === 'string' && profile.handle !== 'handle.invalid'
			? profile.handle
			: locals.did;

	redirect(303, `/p/${actor}`);
};
