import type { Client } from '@atcute/client';

type ServiceAuthClient = Pick<Client, 'get'>;

/**
 * Mint a short-lived (5 min) `com.atproto.server.getServiceAuth` token for `aud`,
 * scoped to a single XRPC method (`lxm`). Shared by the community remotes and the
 * membership helpers so the auth call lives in exactly one place.
 */
export async function mintServiceAuth(
	oauthClient: ServiceAuthClient,
	aud: string,
	lxm: string
): Promise<string> {
	const res = await oauthClient.get('com.atproto.server.getServiceAuth', {
		params: {
			aud: aud as `did:${string}:${string}`,
			lxm: lxm as `${string}.${string}.${string}`,
			exp: Math.floor(Date.now() / 1000) + 300
		}
	});
	if (!res.ok) {
		throw new Error(`getServiceAuth failed: ${res.status} ${JSON.stringify(res.data)}`);
	}
	return res.data.token;
}
