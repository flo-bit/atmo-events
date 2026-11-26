import { getNotifications } from '#lib/notifications/server.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const pageTitle = 'Notifications';
	if (!locals.did) return { inbox: null, now: Date.now(), pageTitle };
	const notify = await getNotifications();
	await notify.enroll(locals.did);
	const [inbox, unread] = await Promise.all([
		notify.list(locals.did),
		notify.unreadCount(locals.did)
	]);
	return { inbox: { ...inbox, unread }, now: Date.now(), pageTitle };
};
