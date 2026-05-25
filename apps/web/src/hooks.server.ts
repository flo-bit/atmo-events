import type { Handle } from '@sveltejs/kit';
import { restoreSession } from '$lib/atproto/server/session';
import { buildDidDocument } from '$lib/notify/did-document';

export const handle: Handle = async ({ event, resolve }) => {
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

	const { session, client, did } = await restoreSession(event.cookies, event.platform?.env);

	event.locals.session = session;
	event.locals.client = client;
	event.locals.did = did;

	return resolve(event);
};
