import { env } from 'cloudflare:workers';
import { json } from '@sveltejs/kit';
import { readNearbyPage } from '#lib/server/cities.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	if (query.length > 256) return json({ error: 'Query too long' }, { status: 400 });
	try {
		const result = await readNearbyPage(env.DB, undefined, query);
		return json(
			{ cities: result.cities.slice(0, 8) },
			{
				headers: { 'cache-control': 'public, max-age=60' }
			}
		);
	} catch {
		return json(
			{ error: 'City search unavailable' },
			{
				status: 503,
				headers: { 'cache-control': 'no-store' }
			}
		);
	}
};
