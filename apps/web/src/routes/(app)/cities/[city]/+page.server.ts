import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { refreshCitySnapshot } from '#lib/server/cities.js';
import { error } from '@sveltejs/kit';
import { cityScope } from '#lib/cities.js';
import { normalizeCityAddress } from '#lib/server/city-normalization.js';
import { getServerClient, ensureInit } from '#lib/contrail/index.js';
import { cityQuery } from '#lib/contrail/queries.js';
import { rawForQuery } from '#lib/contrail/cursor.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const normalized = normalizeCityAddress({
		city: params.city,
		country: url.searchParams.get('country') ?? '',
		region: url.searchParams.get('region') ?? ''
	});
	if (!normalized) error(404, 'City not found');
	const city = normalized.label;
	const scope = cityScope(city)!;
	const cursor = rawForQuery(url.searchParams.get('cursor'), 'city', scope);
	if (dev) {
		await ensureInit(env.DB);
		await refreshCitySnapshot(env.DB);
	}
	const page = await cityQuery(getServerClient(env.DB), scope, cursor, env.DB);
	return {
		...page,
		city,
		pageTitle: `Events in ${city.city}`,
		pageDescription: `Find upcoming events in ${city.city} on the open social web.`
	};
};
