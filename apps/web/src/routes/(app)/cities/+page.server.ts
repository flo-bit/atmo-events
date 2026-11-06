import { env } from 'cloudflare:workers';
import { dev } from '$app/env';
import { ensureInit } from '#lib/contrail/index.js';
import { readCitySuggestions, refreshCitySnapshot } from '#lib/server/cities.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, setHeaders }) => {
	// Results vary by visitor, so they must never be shared by an intermediary.
	setHeaders({ 'cache-control': 'private, no-store' });
	const meta = {
		pageTitle: 'Browse Cities',
		pageDescription: 'Find upcoming events by city on the open social web.'
	};
	try {
		if (dev) {
			await ensureInit(env.DB);
			await refreshCitySnapshot(env.DB);
		}
		const cf = (
			request as Request & { cf?: { latitude?: string; longitude?: string; country?: string } }
		).cf;
		return { ...meta, ...(await readCitySuggestions(env.DB, cf)) };
	} catch (error) {
		console.warn('[cities] upcoming cities unavailable:', error);
		return { ...meta, cities: null, nearby: [], inCountry: [] };
	}
};
