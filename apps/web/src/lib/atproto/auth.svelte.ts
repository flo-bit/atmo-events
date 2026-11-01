import type { AppBskyActorDefs } from '@atcute/bluesky';
import type { Did } from '@atcute/lexicons';
import {
	PREFERRED_CLIENT_COLLECTION,
	PREFERRED_CLIENT_SCOPE,
	type PreferredSocialClient
} from '@atmo-dev/kit/social';
import { page } from '$app/state';
import { CONNECTION_SCOPE, connectionCapability } from '../meet/connection';
import {
	login as oauthLogin,
	signup as oauthSignup,
	requestPermissions
} from '@svelte-atproto/oauth/client';
export { logout } from '@svelte-atproto/oauth/client';
import {
	ALLOW_SIGNUP,
	REDIRECT_TO_LAST_PAGE_ON_LOGIN,
	getLoginScopes,
	blueskyPostingScope,
	type LoginContext
} from './settings';

export const user = {
	get profile() {
		return (page.data?.profile as AppBskyActorDefs.ProfileViewDetailed | null) ?? null;
	},
	get isLoggedIn() {
		return !!page.data?.did;
	},
	get did() {
		return (page.data?.did as Did | null) ?? null;
	},
	get preferredSocialClient(): PreferredSocialClient | null {
		return page.data?.preferredSocialClient ?? null;
	},
	get canPostToBluesky() {
		return page.data?.canPostToBluesky === true;
	}
};

export function login(handle: string, options?: LoginContext & { scopes?: readonly string[] }) {
	let normalized = handle.trim().replace(/^@/, '');
	if (!normalized.startsWith('did:') && !normalized.includes('.') && normalized.length > 3) {
		normalized += '.bsky.social';
	}
	return oauthLogin(normalized, {
		scope: getLoginScopes(options?.scopes, options),
		saveReturnTo: REDIRECT_TO_LAST_PAGE_ON_LOGIN
	});
}

/** Incrementally authorize this setting without dropping any prior request tokens. */
export function authorizePreferredSocialClient() {
	return requestPermissions(PREFERRED_CLIENT_SCOPE, {
		requirements: [
			{ type: 'repo', collection: PREFERRED_CLIENT_COLLECTION, action: 'create' },
			{ type: 'repo', collection: PREFERRED_CLIENT_COLLECTION, action: 'update' }
		],
		saveReturnTo: true
	});
}

/** Existing sessions can add meeting writes without another ordinary login. */
export function authorizeMeetings() {
	return requestPermissions(CONNECTION_SCOPE, {
		requirements: [connectionCapability],
		saveReturnTo: true
	});
}

export function signup(context?: LoginContext) {
	if (!ALLOW_SIGNUP) throw new Error('Signup is not enabled');
	return oauthSignup({
		scope: getLoginScopes([blueskyPostingScope], context),
		saveReturnTo: REDIRECT_TO_LAST_PAGE_ON_LOGIN
	});
}
