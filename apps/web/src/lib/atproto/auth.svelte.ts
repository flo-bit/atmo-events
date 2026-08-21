import { AppBskyActorDefs } from '@atcute/bluesky';
import type { Did } from '@atcute/lexicons';
import {
	login as startLogin,
	logout as endSession,
	signup as startSignup
} from '@svelte-atproto/oauth/client';
import { page } from '$app/state';
import { ALLOW_SIGNUP, REDIRECT_TO_LAST_PAGE_ON_LOGIN } from './settings';

export const user = {
	get profile() {
		return (page.data?.profile as AppBskyActorDefs.ProfileViewDetailed | null) ?? null;
	},
	get isLoggedIn() {
		return !!page.data?.did;
	},
	get did() {
		return (page.data?.did as Did | null) ?? null;
	}
};

export async function login(input: string) {
	let handle = input.trim();
	if (handle.startsWith('@')) handle = handle.slice(1);

	if (handle.startsWith('did:')) {
		if (handle.length < 6) throw new Error('DID must be at least 6 characters');
	} else if (handle.includes('.')) {
		if (handle.length < 4) throw new Error('Handle must be at least 4 characters');
	} else if (handle.length > 3) {
		handle += '.bsky.social';
	} else {
		throw new Error('Please provide a valid handle or DID.');
	}

	await startLogin(handle, { saveReturnTo: REDIRECT_TO_LAST_PAGE_ON_LOGIN });
}

export async function signup() {
	if (!ALLOW_SIGNUP) throw new Error('Signup is not enabled');
	await startSignup({ saveReturnTo: REDIRECT_TO_LAST_PAGE_ON_LOGIN });
}

export async function logout() {
	await endSession();
}
