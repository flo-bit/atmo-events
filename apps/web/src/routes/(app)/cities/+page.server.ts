import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { ensureInit } from '#lib/contrail/index.js';
import { readTopCities, refreshCitySnapshot } from '#lib/server/cities.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const meta = {
		pageTitle: 'Browse Cities',
		pageDescription: 'Find upcoming events by city on the open social web.'
	};
	try {
		if (dev) {
			await ensureInit(env.DB);
			await refreshCitySnapshot(env.DB);
		}
		const cities = await readTopCities(env.DB);
		return { ...meta, cities };
	} catch (error) {
		console.warn('[cities] upcoming cities unavailable:', error);
		return { ...meta, cities: null };
	}
};
