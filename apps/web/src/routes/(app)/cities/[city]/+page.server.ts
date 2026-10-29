import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { cityScope } from '#lib/cities.js';
import { normalizeCityAddress } from '#lib/server/city-normalization.js';
import { getServerClient } from '#lib/contrail/index.js';
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
	const page = await cityQuery(getServerClient(env.DB), scope, cursor);
	return {
		...page,
		city,
		pageTitle: `Events in ${city.city}`,
		pageDescription: `Find upcoming events in ${city.city} on the open social web.`
	};
};
