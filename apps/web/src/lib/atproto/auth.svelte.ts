import type { AppBskyActorDefs } from '@atcute/bluesky';
import type { Did } from '@atcute/lexicons';
import { page } from '$app/state';
import { login as oauthLogin, signup as oauthSignup } from '@svelte-atproto/oauth/client';
export { logout } from '@svelte-atproto/oauth/client';
import {
	ALLOW_SIGNUP,
	REDIRECT_TO_LAST_PAGE_ON_LOGIN,
	getLoginScopes,
	blueskyPostingScope
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
	get canPostToBluesky() {
		return page.data?.canPostToBluesky === true;
	}
};

export function login(handle: string, options?: { scopes: readonly string[] }) {
	let normalized = handle.trim().replace(/^@/, '');
	if (!normalized.startsWith('did:') && !normalized.includes('.') && normalized.length > 3) {
		normalized += '.bsky.social';
	}
	return oauthLogin(normalized, {
		scope: getLoginScopes(options?.scopes),
		saveReturnTo: REDIRECT_TO_LAST_PAGE_ON_LOGIN
	});
}

export function signup() {
	if (!ALLOW_SIGNUP) throw new Error('Signup is not enabled');
	return oauthSignup({
		scope: getLoginScopes([blueskyPostingScope]),
		saveReturnTo: REDIRECT_TO_LAST_PAGE_ON_LOGIN
	});
}
