import { env } from 'cloudflare:workers';
import { searchBackendFromEnv } from '#lib/search/server/query.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Geo search has no D1 fallback; tell the page whether to offer it at all.
	return { pageTitle: 'Events Near Me', available: searchBackendFromEnv(env) !== null };
};
