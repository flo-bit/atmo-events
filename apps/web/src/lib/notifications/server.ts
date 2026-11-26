import { env } from 'cloudflare:workers';
import { createNotify, webPush } from '@atmo-dev/notify';
import { setupNotificationState } from './watched';

export const categories = {
	reminder: {
		title: 'Event reminders',
		description: '15 minutes before your upcoming events',
		channels: ['push']
	},
	change: {
		title: 'Event changes',
		description: 'Time, location and cancellations',
		channels: ['push']
	},
	rsvp: { title: 'New RSVPs', description: 'For events you host', channels: ['push'] }
};

const ready = new WeakMap<D1Database, Promise<void>>();

/** Private authoritative storage in its own database: not the projection, not reports. */
export async function getNotifications() {
	if (!env.NOTIFY_DB || env.NOTIFY_DB === env.DB) {
		throw new Error('Notifications require the stable NOTIFY_DB binding');
	}
	const push = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK && env.VAPID_SUBJECT;
	const notify = createNotify({
		db: env.NOTIFY_DB,
		categories: Object.fromEntries(
			Object.entries(categories).map(([key, value]) => [
				key,
				{ ...value, channels: push ? ['push'] : [] }
			])
		),
		audience: 'enrolled',
		channels: push
			? {
					push: webPush({
						publicKey: env.VAPID_PUBLIC_KEY!,
						privateJwk: env.VAPID_PRIVATE_JWK!,
						subject: env.VAPID_SUBJECT!
					})
				}
			: {}
	});
	let init = ready.get(env.NOTIFY_DB);
	if (!init) {
		const db = env.NOTIFY_DB;
		init = notify
			.setup()
			.then(() => setupNotificationState(db))
			.catch((error) => {
				ready.delete(db);
				throw error;
			});
		ready.set(db, init);
	}
	await init;
	return notify;
}

export function pushConfigured() {
	return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK && env.VAPID_SUBJECT);
}
