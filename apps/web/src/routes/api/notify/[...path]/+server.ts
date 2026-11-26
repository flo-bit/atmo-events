import { env } from 'cloudflare:workers';
import { createNotifyHandler } from '@atmo-dev/notify/handler';
import { getNotifications, pushConfigured } from '#lib/notifications/server.js';
import type { RequestHandler } from './$types';

const handle: RequestHandler = async ({ request, locals }) => {
	// Do not initialize storage for anonymous requests.
	if (!locals.did)
		return new Response('Sign in required', {
			status: 401,
			headers: { 'cache-control': 'private, no-store' }
		});
	return createNotifyHandler(await getNotifications(), {
		vapidPublicKey: pushConfigured() ? env.VAPID_PUBLIC_KEY : undefined
	})(request, locals.did);
};
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
