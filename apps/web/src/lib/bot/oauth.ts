import { env } from 'cloudflare:workers';
import { getRequestEvent } from '$app/server';
import {
	OAuthClient,
	type ClientAssertionPrivateJwk,
	type OAuthClientMetadata,
	type ConfidentialClientMetadata,
	type PublicClientMetadata,
	type Store,
	type StoredSession,
	type StoredState
} from '@atcute/oauth-node-client';
import type { Did } from '@atcute/lexicons';
import { createActorResolver } from '@svelte-atproto/oauth/network';
import { cloudflareKV } from '@svelte-atproto/oauth/server/stores/cloudflare';
import type { SessionWithHistory } from '@svelte-atproto/oauth/server';
import { getAuth, oauthRequestLock } from '#lib/atproto/server/oauth.js';
import { DEV_PORT, DOH_RESOLVER, REDIRECT_PATH } from '#lib/atproto/settings.js';

/** Preserve the library's request history and login generation on bot refreshes. */
export function backgroundSessions(store: Store<Did, StoredSession>): Store<Did, StoredSession> {
	return {
		get: (did) => store.get(did),
		delete: (did) => store.delete(did),
		clear: () => store.clear(),
		async set(did, session) {
			let previous: SessionWithHistory | undefined;
			try {
				previous = await store.get(did);
			} catch {
				// A refresh has already spent its old token; save the new one even
				// if a transient read failure prevents preserving advisory history.
			}
			await store.set(did, {
				...session,
				...(previous?.svelteAtproto ? { svelteAtproto: previous.svelteAtproto } : {}),
				...(previous?.svelteAtprotoSessionId
					? { svelteAtprotoSessionId: previous.svelteAtprotoSessionId }
					: {})
			} as SessionWithHistory);
		}
	};
}

let client: OAuthClient | undefined;

/** The library API restores only the current browser's session. The reply bot
 * needs another user's stored grant during cron; use the SDK solely for that
 * operation, with the library's metadata, storage format, and shared lock. */
export async function restoreRsvpSession(did: Did) {
	if (!client) {
		const response = await getAuth().handlers.metadata(getRequestEvent());
		if (!response.ok) throw new Error('OAuth client metadata unavailable');
		const metadata = (await response.json()) as OAuthClientMetadata;
		const prefix = env.OAUTH_PUBLIC_URL
			? `${env.OAUTH_PUBLIC_URL}/oauth-client-metadata.json`
			: `loopback:${DEV_PORT}${REDIRECT_PATH}`;
		const common = {
			actorResolver: createActorResolver({ doh: DOH_RESOLVER }),
			stores: {
				sessions: backgroundSessions(cloudflareKV<Did, StoredSession>(env.OAUTH_SESSIONS)),
				states: cloudflareKV<string, StoredState>(env.OAUTH_STATES, { ttl: 600 })
			},
			requestLock: <T>(name: string, operation: () => Promise<T>) =>
				oauthRequestLock(`${prefix}:${name}`, operation)
		};
		client =
			metadata.token_endpoint_auth_method === 'private_key_jwt'
				? new OAuthClient({
						...common,
						metadata: metadata as ConfidentialClientMetadata,
						keyset: [JSON.parse(env.CLIENT_ASSERTION_KEY) as ClientAssertionPrivateJwk]
					})
				: new OAuthClient({ ...common, metadata: metadata as PublicClientMetadata });
	}
	return client.restore(did);
}
