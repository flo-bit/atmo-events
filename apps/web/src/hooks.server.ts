import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { restoreSession } from '$lib/atproto/server/session';
import { buildDidDocument } from '$lib/notify/did-document';
import { DEV_BUYER_DID, getDevBuyerDidDocument } from '$lib/atproto/server/dev-account';
import { getSignedCookie, setSignedCookie } from '$lib/atproto/server/signed-cookie';
import { scopes } from '$lib/atproto/settings';

const DEV_SHOWCASE_PATH = '/p/did:web:atm-dev-external-app.localhost/e/dev-showcase';

function isLoopback(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export const handle: Handle = async ({ event, resolve }) => {
	if (dev && event.url.pathname === '/.well-known/did.json' && event.url.hostname === 'localhost') {
		return new Response(JSON.stringify(await getDevBuyerDidDocument(), null, 2), {
			headers: { 'content-type': 'application/did+ld+json', 'cache-control': 'no-store' }
		});
	}

	// Publish our did:web document (served via a hook because SvelteKit ignores
	// route directories that start with a dot). Public endpoint — no session.
	if (event.url.pathname === '/.well-known/did.json' && event.platform?.env) {
		const doc = await buildDidDocument(event.platform.env);
		if (doc) {
			return new Response(JSON.stringify(doc, null, 2), {
				headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }
			});
		}
	}

	// The disposable ATM showcase always starts as the local buyer in dev. This
	// keeps the purchase test deterministic even after the Vite process/browser
	// is restarted, while every other route keeps the normal OAuth behavior.
	if (
		dev &&
		isLoopback(event.url.hostname) &&
		event.url.pathname === DEV_SHOWCASE_PATH &&
		!getSignedCookie(event.cookies, 'did')
	) {
		const cookieOptions = {
			path: '/',
			httpOnly: true,
			secure: false,
			sameSite: 'lax' as const,
			maxAge: 60 * 60 * 24
		};
		setSignedCookie(event.cookies, 'did', DEV_BUYER_DID, cookieOptions);
		setSignedCookie(event.cookies, 'scope', scopes.join(' '), cookieOptions);
	}

	const { session, client, did } = await restoreSession(event.cookies, event.platform?.env);

	event.locals.session = session;
	event.locals.client = client;
	event.locals.did = did;

	return resolve(event);
};
