import { env } from 'cloudflare:workers';
import { ensureInit } from '#lib/contrail/index.js';
import { readTopCities } from '#lib/server/cities.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const meta = {
		pageTitle: 'Browse Cities',
		pageDescription: 'Find upcoming events by city on the open social web.'
	};
	try {
		await ensureInit(env.DB);
		const cities = await readTopCities(env.DB);
		return { ...meta, cities };
	} catch (error) {
		console.warn('[cities] upcoming cities unavailable:', error);
		return { ...meta, cities: null };
	}
};
