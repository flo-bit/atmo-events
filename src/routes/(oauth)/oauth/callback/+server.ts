import { redirect } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/atproto/server/oauth';
import { setSignedCookie } from '$lib/atproto/server/signed-cookie';
import { scopes } from '$lib/atproto/settings';
import { getServerClient } from '$lib/contrail';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	const oauth = createOAuthClient(platform?.env);

	// oauth.callback() validates the state parameter (CSRF protection) and
	// exchanges the authorization code for tokens via the token endpoint.
	let did: string | null = null;
	try {
		const { session } = await oauth.callback(url.searchParams);
		did = session.did;

		const cookieOpts = {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax' as const,
			maxAge: 60 * 60 * 24 * 180 // 180 days
		};

		setSignedCookie(cookies, 'did', session.did, cookieOpts);
		setSignedCookie(cookies, 'scope', scopes.join(' '), cookieOpts);
	} catch (e) {
		console.error('OAuth callback failed:', e);
		redirect(303, '/?error=auth_failed');
	}

	// Pre-warm the personalized feed: fire-and-forget a getFeed call so contrail
	// kicks off the on-demand follow-backfill (which now runs out-of-band via
	// waitUntil) while the user is being redirected. By the time they land on
	// the home page, feed_items should be populated. We don't await — the call
	// itself returns immediately; the bootstrap continues in the background.
	if (did && platform?.env.DB) {
		const warm = (async () => {
			try {
				const client = getServerClient(platform.env.DB);
				await client.get('rsvp.atmo.getFeed', {
					params: {
						feed: 'network',
						actor: did as `did:${string}:${string}`,
						collection: 'rsvp',
						limit: 1
					}
				});
			} catch (e) {
				console.warn('[oauth/callback] feed pre-warm failed:', e);
			}
		})();
		platform.ctx?.waitUntil(warm);
	}

	const returnTo = cookies.get('oauth_return_to');
	if (returnTo) {
		cookies.delete('oauth_return_to', { path: '/' });
		const decoded = decodeURIComponent(returnTo);
		if (decoded.startsWith('/') && !decoded.startsWith('//')) {
			redirect(303, decoded);
		}
	}

	redirect(303, '/');
};
