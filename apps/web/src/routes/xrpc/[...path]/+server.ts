import { env } from 'cloudflare:workers';
import { handleContrailRequest } from '#lib/contrail/index.js';
import { parseAtUri, MAX_NOTIFY_URIS } from '@atmo-dev/contrail';
import type { RequestHandler } from './$types';

const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, OPTIONS',
	'access-control-allow-headers': 'content-type',
	'access-control-max-age': '86400'
};

export const GET: RequestHandler = async ({ request }) => {
	const response = await handleContrailRequest(request, env.DB);
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
	return new Response(response.body, { status: response.status, headers });
};

// The only browser-facing mutation is an authoritative cache hint for the
// signed-in actor's own records. Report routes are disabled in Contrail config.
export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (url.pathname !== '/xrpc/rsvp.atmo.notifyOfUpdate') return new Response(null, { status: 404 });
	if (!locals.did) return new Response('Not authenticated', { status: 401 });
	if (request.headers.get('origin') !== url.origin)
		return new Response('Forbidden', { status: 403 });
	// Bound the actual streamed body, not only the caller-supplied Content-Length.
	const reader = request.body?.getReader();
	if (!reader) return new Response('Invalid request', { status: 400 });
	const chunks: Uint8Array[] = [];
	let size = 0;
	let timer: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error('Body timeout'));
			void reader.cancel().catch(() => {});
		}, 5000);
	});
	try {
		for (;;) {
			const { done, value } = await Promise.race([reader.read(), deadline]);
			if (done) break;
			size += value.length;
			if (size > 32_768) {
				await reader.cancel();
				return new Response('Request too large', { status: 413 });
			}
			chunks.push(value);
		}
	} catch {
		return new Response('Invalid request', { status: 400 });
	} finally {
		clearTimeout(timer!);
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	let body: { uri?: unknown; uris?: unknown };
	try {
		body = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return new Response('Invalid request', { status: 400 });
	}
	const uris = Array.isArray(body?.uris) ? body.uris : [body?.uri];
	if (
		!uris.length ||
		uris.length > MAX_NOTIFY_URIS ||
		uris.some((uri) => typeof uri !== 'string' || parseAtUri(uri)?.did !== locals.did)
	) {
		return new Response('Forbidden', { status: 403 });
	}
	return handleContrailRequest(
		new Request(request.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ uris })
		}),
		env.DB
	);
};
export const OPTIONS: RequestHandler = async () =>
	new Response(null, { status: 204, headers: CORS_HEADERS });
