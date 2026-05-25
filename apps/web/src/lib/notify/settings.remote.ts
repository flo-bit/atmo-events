import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { Client } from '@atcute/client';
import type { Did, Nsid } from '@atcute/lexicons';
import { LXM_REQUEST_PERMISSION, LXM_REVOKE_SELF, RELAY_DID } from './config';
import { notifyConfigured } from './keypair';
import { relayRequestPermission, relayRevokeSelf } from './relay';
import { ensureNotifySchema, setSubscriber } from './db';

/** Mint a user service-auth token (issued by the user's PDS) for a relay method.
 *  Requires the matching `rpc?lxm=…&aud=*` OAuth scope (see settings.ts). */
async function mintUserToken(client: Client, lxm: string): Promise<string> {
	const res = await client.get('com.atproto.server.getServiceAuth', {
		params: { aud: RELAY_DID as Did, lxm: lxm as Nsid }
	});
	if (!res.ok) throw new Error('could not mint user token');
	return res.data.token;
}

/** Ask atmo.pub to let us notify the signed-in user. `alreadyGranted` means we
 *  can send right away; `pending` means they must approve it on atmo.pub (the
 *  subscriberChanged webhook then flips them to enabled). */
export const enableNotifications = command(async (): Promise<{ status: 'enabled' | 'pending' }> => {
	const { locals, platform } = getRequestEvent();
	const env = platform?.env;
	if (!env || !notifyConfigured(env)) error(400, 'Notifications are not configured');
	if (!locals.client || !locals.did) error(401, 'Not signed in');

	try {
		const userToken = await mintUserToken(locals.client, LXM_REQUEST_PERMISSION);
		const res = await relayRequestPermission(env, userToken);
		await ensureNotifySchema(env.DB);

		if (res.status === 'alreadyGranted') {
			await setSubscriber(env.DB, locals.did, true);
			return { status: 'enabled' };
		}
		return { status: 'pending' };
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e; // re-throw SvelteKit errors
		error(400, e instanceof Error ? e.message : 'Could not enable notifications');
	}
});

/** Revoke our grant at the relay and stop sending locally. */
export const disableNotifications = command(async (): Promise<{ status: 'disabled' }> => {
	const { locals, platform } = getRequestEvent();
	const env = platform?.env;
	if (!env || !notifyConfigured(env)) error(400, 'Notifications are not configured');
	if (!locals.client || !locals.did) error(401, 'Not signed in');

	try {
		const userToken = await mintUserToken(locals.client, LXM_REVOKE_SELF);
		await relayRevokeSelf(env, userToken);
	} catch (e) {
		// Even if the relay call fails, mark disabled locally so we stop sending.
		console.error('[notify] revokeSelf failed:', e);
	}

	await ensureNotifySchema(env.DB);
	await setSubscriber(env.DB, locals.did, false);
	return { status: 'disabled' };
});
