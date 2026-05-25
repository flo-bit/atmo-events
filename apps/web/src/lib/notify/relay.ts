import { createServiceJwt } from '@atcute/xrpc-server/auth';
import type { Did, Nsid } from '@atcute/lexicons';
import {
	APP_DESCRIPTION,
	APP_NAME,
	LXM_REQUEST_PERMISSION,
	LXM_REVOKE_SELF,
	LXM_SEND,
	RELAY_DID,
	RELAY_ORIGIN
} from './config';
import { getKeypair, getSenderDid } from './keypair';

type Env = App.Platform['env'];

/** Thrown when the relay returns a non-2xx. `status` drives caller behaviour:
 *  403 = no active grant, 429 = rate limited (back off), 401 = bad token. */
export class RelayError extends Error {
	constructor(
		readonly status: number,
		readonly lxm: string,
		readonly data: unknown
	) {
		super(`relay ${lxm} -> ${status}`);
		this.name = 'RelayError';
	}
}

/** Mint a short-lived app token (atproto service-auth JWT, ES256) signed with
 *  our server-side key. Tokens are method-scoped (`lxm`) — mint one per call. */
export async function mintAppToken(env: Env, lxm: string): Promise<string> {
	return createServiceJwt({
		keypair: await getKeypair(env),
		issuer: getSenderDid(env),
		audience: RELAY_DID as Did,
		lxm: lxm as Nsid,
		expiresIn: 60
	});
}

async function relayCall<T = Record<string, unknown>>(
	lxm: string,
	bearer: string,
	body: object
): Promise<T> {
	const res = await fetch(`${RELAY_ORIGIN}/xrpc/${lxm}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = res.headers.get('content-type')?.includes('json')
		? ((await res.json().catch(() => ({}))) as T)
		: ({} as T);
	if (!res.ok) throw new RelayError(res.status, lxm, data);
	return data;
}

export type SendPayload = {
	recipient: string;
	title: string;
	body: string;
	uri?: string;
	category?: string;
	categoryDescription?: string;
	threadKey?: string;
	actors?: string[];
};

/** Deliver a notification. App token only — requires an active grant from the
 *  recipient. `delivered: 0` is success-with-no-channels, not an error. */
export async function relaySend(
	env: Env,
	payload: SendPayload
): Promise<{ id: string; delivered: number }> {
	return relayCall(LXM_SEND, await mintAppToken(env, LXM_SEND), payload);
}

/** Ask a user to allow our app to notify them. Uses the user's token (minted by
 *  the caller from their OAuth session via `com.atproto.server.getServiceAuth`). */
export async function relayRequestPermission(
	env: Env,
	userToken: string
): Promise<{ id: string; status: 'pending' | 'alreadyGranted' }> {
	return relayCall(LXM_REQUEST_PERMISSION, userToken, {
		senderDid: getSenderDid(env),
		title: APP_NAME,
		description: APP_DESCRIPTION,
		iconUrl: `${env.OAUTH_PUBLIC_URL}/og.png`
	});
}

/** Remove our app's grant for the user. Dual-auth: app token in the header,
 *  fresh user token in the body. */
export async function relayRevokeSelf(env: Env, userToken: string): Promise<{ ok: boolean }> {
	const appToken = await mintAppToken(env, LXM_REVOKE_SELF);
	return relayCall(LXM_REVOKE_SELF, appToken, { userToken });
}
