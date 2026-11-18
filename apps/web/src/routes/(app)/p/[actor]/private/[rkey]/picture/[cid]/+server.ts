import { getActor } from '#lib/actor.js';
import { singleEvent } from '#lib/private-events/ids.js';
import { isPictureCid } from '#lib/private-events/pictures.js';
import { callerSession } from '#lib/private-events/server/caller.js';
import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';
import { PrivateEventRefused, readPrivateEventPicture } from '#lib/private-events/server/events.js';
import { timeLimitedNetwork } from '#lib/spaces/server/other-servers.js';
import { errorKind } from '#lib/spaces/server/xrpc.js';

// One of a private event's pictures. Its bytes are kept in the event's space, which no public CDN
// can read, so atmo reads them with the viewer's own access and passes them on, only to someone
// who can see the event.

/** For anyone who must not tell why: not signed in, not on the list, no such event, a CID the event
 *  doesn't cite. Not cached, so someone just added sees the picture at once. */
function notFound(): Response {
	return new Response('Not found', {
		status: 404,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
}

export async function GET({ params, locals }) {
	if (!privateEventsEnabled() || !isPictureCid(params.cid)) return notFound();
	const host = await getActor(params.actor, timeLimitedNetwork());
	const caller = await callerSession(locals.session ?? null);
	if (!host || !caller) return notFound();

	let found;
	try {
		found = await readPrivateEventPicture(caller, singleEvent(host, params.rkey), params.cid);
	} catch (e) {
		if (e instanceof PrivateEventRefused) return notFound();
		// Its kind only: a message can name the space, the person or the picture.
		console.error(`[private-events] picture unread: ${errorKind(e)}`);
		return new Response('This picture could not be read right now.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	if (!found) return notFound();

	return new Response(found.bytes, {
		headers: {
			'content-type': found.type,
			// The viewer's own copy only: a shared cache would hand it to anyone at this address.
			'cache-control': 'private, max-age=300',
			'x-content-type-options': 'nosniff',
			// Bytes the host's server chose, so nothing in them may run if opened on their own.
			'content-security-policy': "default-src 'none'; sandbox"
		}
	});
}
