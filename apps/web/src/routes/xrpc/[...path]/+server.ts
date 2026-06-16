import { createHandler } from '@atmo-dev/contrail/server';
import { contrail, ensureInit } from '$lib/contrail/index';
import type { RequestHandler } from './$types';

const handle = createHandler(contrail);

const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, OPTIONS',
	'access-control-allow-headers': 'content-type',
	'access-control-max-age': '86400'
};

function withCors(res: Response): Response {
	const headers = new Headers(res.headers);
	for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handler(request: Request, platform: App.Platform | undefined) {
	const db = platform!.env.DB;
	// Pass env so the search sink is configured here too: the notify endpoint
	// (rsvp.atmo.notifyOfUpdate) re-ingests a just-written record through
	// applyEvents, which fires the sink — so a new/edited event lands in search
	// immediately on write, not only on the next cron tick.
	await ensureInit(db, platform!.env);
	const res = (await handle(request, db)) as Response;
	return withCors(res);
}

export const GET: RequestHandler = async ({ request, platform }) => handler(request, platform);
export const POST: RequestHandler = async ({ request, platform }) => handler(request, platform);
export const OPTIONS: RequestHandler = async () =>
	new Response(null, { status: 204, headers: CORS_HEADERS });
