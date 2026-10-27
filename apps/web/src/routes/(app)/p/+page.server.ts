import { env } from 'cloudflare:workers';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadProfile } from '#lib/atproto/server/profile.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		redirect(303, '/login');
	}

	const profile = await loadProfile(locals.did, env.DB);
	const actor = profile?.handle ?? locals.did;

	redirect(303, `/p/${actor}`);
};
