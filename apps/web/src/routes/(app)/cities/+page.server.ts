import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { cityScope } from '#lib/cities.js';
import { ensureInit, getServerClient } from '#lib/contrail/index.js';
import { cityQuery, EMPTY_PAGE } from '#lib/contrail/queries.js';
import { readNearbyPage, refreshCitySnapshot } from '#lib/server/cities.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const meta = { pageTitle: 'Events nearby', pageDescription: 'Find events near you.' };
	try {
		if (dev) {
			await ensureInit(env.DB);
			await refreshCitySnapshot(env.DB);
		}
		const cf = (
			request as Request & {
				cf?: {
					city?: string;
					country?: string;
					region?: string;
					regionCode?: string;
					latitude?: string;
					longitude?: string;
				};
			}
		).cf;
		const choosing = url.searchParams.has('choose');
		const search = (url.searchParams.get('q') ?? '').slice(0, 256);
		const selected = url.searchParams.has('city')
			? {
					city: (url.searchParams.get('city') ?? '').slice(0, 256),
					country: (url.searchParams.get('country') ?? '').slice(0, 256),
					region: (url.searchParams.get('region') ?? '').slice(0, 256)
				}
			: cf;
		const result = await readNearbyPage(env.DB, choosing ? undefined : selected, search);
		if (choosing || !result.detected)
			return { ...meta, mode: 'choose' as const, cities: result.cities, search };
		let shown = result.matched;
		let page = shown
			? await cityQuery(getServerClient(env.DB), cityScope(shown)!, null, env.DB)
			: EMPTY_PAGE;
		const noLocalEvents = !shown || (!page.events.length && !page.cursor);
		if (noLocalEvents && result.nearest) {
			shown = result.nearest;
			page = await cityQuery(getServerClient(env.DB), cityScope(shown)!, null, env.DB);
		}
		return {
			...meta,
			mode: 'events' as const,
			detected: result.detected,
			shown,
			noLocalEvents,
			...page
		};
	} catch (error) {
		console.warn('[cities] nearby events unavailable:', error);
		return { ...meta, mode: 'unavailable' as const };
	}
};
