import { getAuth } from '#lib/atproto/server/oauth.js';
import { listForSession, requireModerator } from '#lib/moderation/operations.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders, url }) => {
	setHeaders({ 'cache-control': 'no-store' });
	requireModerator(locals);
	const status = url.searchParams.get('status') === 'resolved' ? 'resolved' : 'open';
	const inbox = await listForSession(locals, { status, limit: 50 });
	const canPublishActions = await getAuth().api.can({
		type: 'repo',
		collection: 'tools.atmo.moderation.action',
		action: 'create'
	});
	return {
		...inbox,
		status: status as 'open' | 'resolved',
		canPublishActions,
		pageTitle: 'Reports'
	};
};
