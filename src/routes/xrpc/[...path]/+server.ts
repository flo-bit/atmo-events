import { createHandler } from '@atmo-dev/contrail/server';
import { contrail, ensureInit } from '$lib/contrail/index';
import type { RequestHandler } from './$types';

const handle = createHandler(contrail);

async function handler(request: Request, platform: App.Platform | undefined) {
	const db = platform!.env.DB;
	await ensureInit(db);
	const url = new URL(request.url);
	const nsid = url.pathname.replace(/^\/xrpc\//, '');
	const startedAt = Date.now();
	const response = (await handle(request, db)) as Response;
	console.log(
		`[xrpc] ${request.method} ${nsid}${url.search} → ${response.status} in ${Date.now() - startedAt}ms`
	);
	return response;
}

export const GET: RequestHandler = async ({ request, platform }) => handler(request, platform);
export const POST: RequestHandler = async ({ request, platform }) => handler(request, platform);
