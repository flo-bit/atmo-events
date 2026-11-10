import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { cityScope, type CityScope } from '#lib/cities.js';
import { ensureInit, getServerClient } from '#lib/contrail/index.js';
import { cityQuery, EMPTY_PAGE } from '#lib/contrail/queries.js';
import { NEARBY_RADIUS_KM, readNearbyPage, refreshCitySnapshot } from '#lib/server/cities.js';
import type { PageServerLoad } from './$types';

const PREFERENCE = 'nearby-city';
const COOKIE_PATH = '/cities';
function preference(value: string | undefined): CityScope | undefined {
	if (!value || value.length > 3072) return;
	try {
		const parsed = JSON.parse(value);
		return cityScope(parsed)
			? { city: parsed.city, country: parsed.country, region: parsed.region }
			: undefined;
	} catch {
		return;
	}
}

export const load: PageServerLoad = async ({ request, url, setHeaders, cookies }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const meta = { pageTitle: 'Events nearby', pageDescription: 'Find upcoming events near you.' };
	try {
		if (dev) {
			await ensureInit(env.DB);
			await refreshCitySnapshot(env.DB);
		}
		const cf = (request as Request & { cf?: Parameters<typeof readNearbyPage>[1] }).cf;
		const choosing = url.searchParams.has('choose');
		const useIp = url.searchParams.has('locate');
		if (useIp) cookies.delete(PREFERENCE, { path: COOKIE_PATH });
		const search = (url.searchParams.get('q') ?? '').slice(0, 256);
		const requested = url.searchParams.has('city')
			? {
					city: (url.searchParams.get('city') ?? '').slice(0, 256),
					country: (url.searchParams.get('country') ?? '').slice(0, 256),
					region: (url.searchParams.get('region') ?? '').slice(0, 256)
				}
			: undefined;
		const selected = useIp ? undefined : (requested ?? preference(cookies.get(PREFERENCE)));
		const result = await readNearbyPage(env.DB, choosing ? undefined : (selected ?? cf), search, {
			explicit: !choosing && !!selected
		});
		if (choosing || !result.detected)
			return { ...meta, mode: 'choose' as const, cities: result.cities, search };
		if (requested && !useIp) {
			const value = JSON.stringify(result.detected);
			// Cookie limits count encoded bytes, not JavaScript characters.
			if (encodeURIComponent(value).length <= 3072)
				cookies.set(PREFERENCE, value, {
					path: COOKIE_PATH,
					maxAge: 90 * 24 * 60 * 60,
					httpOnly: true,
					sameSite: 'lax',
					secure: !dev
				});
		}
		let shown = result.matched;
		let page = shown
			? await cityQuery(getServerClient(env.DB), cityScope(shown)!, null, env.DB)
			: EMPTY_PAGE;
		const noLocalEvents = !shown || (!page.events.length && !page.cursor);
		let distanceKm: number | null = null;
		if (noLocalEvents) {
			shown = null;
			// The snapshot may still list expired/deleted/hidden events. Try the
			// bounded nearest candidates, not just the first stale catalog entry.
			for (const candidate of result.nearby) {
				const next = await cityQuery(
					getServerClient(env.DB),
					cityScope(candidate.city)!,
					null,
					env.DB
				);
				if (!next.events.length && !next.cursor) continue;
				shown = candidate.city;
				page = next;
				distanceKm = Math.round(candidate.distanceKm);
				break;
			}
		}
		return {
			...meta,
			mode: 'events' as const,
			detected: result.detected,
			locationSource: selected ? ('selected' as const) : ('ip' as const),
			shown,
			noLocalEvents,
			distanceKm,
			radiusKm: NEARBY_RADIUS_KM,
			...page
		};
	} catch (error) {
		console.warn('[cities] nearby events unavailable:', error);
		return { ...meta, mode: 'unavailable' as const };
	}
};
