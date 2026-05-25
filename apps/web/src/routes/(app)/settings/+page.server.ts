import { notifyConfigured } from '$lib/notify/keypair';
import { ensureNotifySchema, getSubscriber } from '$lib/notify/db';
import type { PageServerLoad } from './$types';

export type NotifyState = 'enabled' | 'disabled' | 'none';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const env = platform?.env;
	const configured = !!env && notifyConfigured(env);

	if (!locals.did || !configured || !env) {
		return { configured, loggedIn: !!locals.did, state: 'none' as NotifyState };
	}

	await ensureNotifySchema(env.DB);
	const sub = await getSubscriber(env.DB, locals.did);
	const state: NotifyState = !sub ? 'none' : sub.enabled ? 'enabled' : 'disabled';

	return { configured, loggedIn: true, state };
};
