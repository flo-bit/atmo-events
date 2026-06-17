import { searchBackendFromEnv } from '$lib/search/server/query';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	// Geo search has no D1 fallback; tell the page whether to offer it at all.
	return { available: searchBackendFromEnv(platform?.env) !== null };
};
