import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { DEV_BUYER_DID } from '$lib/atproto/server/dev-account';
import { setSignedCookie } from '$lib/atproto/server/signed-cookie';
import { scopes } from '$lib/atproto/settings';
import type { RequestHandler } from './$types';

function isLoopback(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function safeRedirect(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
	return raw;
}

/** Seed the local dev ticket buyer without touching a real AT Protocol account. */
export const GET: RequestHandler = ({ url, cookies }) => {
	if (!dev || !isLoopback(url.hostname)) error(404, 'Not found');

	const cookieOptions = {
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'lax' as const,
		maxAge: 60 * 60 * 24
	};
	setSignedCookie(cookies, 'did', DEV_BUYER_DID, cookieOptions);
	setSignedCookie(cookies, 'scope', scopes.join(' '), cookieOptions);

	redirect(303, safeRedirect(url.searchParams.get('redirect')));
};
