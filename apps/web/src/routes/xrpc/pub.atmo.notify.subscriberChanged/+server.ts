import { json } from '@sveltejs/kit';
import { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';
import {
	CompositeDidDocumentResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver
} from '@atcute/identity-resolver';
import type { Did, Nsid } from '@atcute/lexicons';
import { LXM_SUBSCRIBER_CHANGED, RELAY_DID } from '$lib/notify/config';
import { getSenderDid, notifyConfigured } from '$lib/notify/keypair';
import { ensureNotifySchema, setSubscriber } from '$lib/notify/db';
import type { RequestHandler } from './$types';

// Relay -> us callback: fires when a user enables/disables notifications from
// our app (e.g. on atmo.pub). Lets us keep `notify_subscribers` accurate without
// polling. This route is more specific than /xrpc/[...path], so it wins.

let verifier: ServiceJwtVerifier | null = null;
function getVerifier(serviceDid: Did): ServiceJwtVerifier {
	if (!verifier) {
		verifier = new ServiceJwtVerifier({
			serviceDid,
			resolver: new CompositeDidDocumentResolver({
				methods: { plc: new PlcDidDocumentResolver(), web: new WebDidDocumentResolver() }
			})
		});
	}
	return verifier;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform!.env;
	if (!notifyConfigured(env)) return json({ error: 'NotConfigured' }, { status: 404 });

	const authz = request.headers.get('authorization') ?? '';
	const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
	if (!token) return json({ error: 'NotAuthorized' }, { status: 401 });

	// Verify signature + aud (our DID) + lxm, then the critical check: the issuer
	// MUST be the relay — otherwise anyone could forge enrollment changes.
	const result = await getVerifier(getSenderDid(env)).verify(token, {
		lxm: LXM_SUBSCRIBER_CHANGED as Nsid
	});
	if (!result.ok || result.value.issuer !== RELAY_DID) {
		return json({ error: 'NotAuthorized' }, { status: 401 });
	}

	let body: { recipient?: unknown; enabled?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'InvalidRequest' }, { status: 400 });
	}
	if (typeof body.recipient !== 'string' || typeof body.enabled !== 'boolean') {
		return json({ error: 'InvalidRequest' }, { status: 400 });
	}

	await ensureNotifySchema(env.DB);
	await setSubscriber(env.DB, body.recipient, body.enabled);
	return json({ ok: true });
};
