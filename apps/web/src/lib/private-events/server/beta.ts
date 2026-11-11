import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { BETA_COLLECTION, BETA_RKEY, privateEventsBetaOn } from '../beta';

/** The person's beta record, read directly from their PDS; null when they have none. */
export async function readBetaRecord(client: Client, did: Did, signal?: AbortSignal) {
	const response = await client.get('com.atproto.repo.getRecord', {
		params: { repo: did, collection: BETA_COLLECTION, rkey: BETA_RKEY },
		signal
	});
	if (!response.ok) {
		if (response.data.error === 'RecordNotFound') return null;
		throw new Error('Could not load the beta setting');
	}
	return { record: response.data.value as Record<string, unknown>, cid: response.data.cid };
}

/** Whether the signed-in person turned private events on. Off when signed out or unreadable. */
export async function privateEventsBeta(locals: {
	client?: Client | null;
	did?: Did | null;
}): Promise<boolean> {
	if (!locals.client || !locals.did) return false;
	try {
		const found = await readBetaRecord(locals.client, locals.did, AbortSignal.timeout(5_000));
		return privateEventsBetaOn(found?.record);
	} catch (e) {
		console.warn('[private-events] the beta setting could not be read:', e);
		return false;
	}
}

/** Whether this sign-in may write the beta record. */
export async function canSaveBeta(): Promise<boolean> {
	try {
		const api = getAuth().api;
		return (
			(await api.can({ type: 'repo', collection: BETA_COLLECTION, action: 'create' })) &&
			(await api.can({ type: 'repo', collection: BETA_COLLECTION, action: 'update' }))
		);
	} catch {
		return false;
	}
}

export class BetaNotSaved extends Error {}

/** Saves the choice over the record as it was read, keeping any other fields it has. */
export async function saveBeta(client: Client, did: Did, privateEvents: boolean, now = new Date()) {
	const current = await readBetaRecord(client, did);
	const record = {
		...current?.record,
		$type: BETA_COLLECTION,
		privateEvents,
		updatedAt: now.toISOString()
	};
	const response = await client.post('com.atproto.repo.putRecord', {
		input: {
			repo: did,
			collection: BETA_COLLECTION,
			rkey: BETA_RKEY,
			record,
			swapRecord: current?.cid ?? null
		}
	});
	if (!response.ok) {
		throw new BetaNotSaved(
			response.data.error === 'InvalidSwap'
				? 'This setting changed elsewhere. Reload and try again.'
				: 'Could not save this setting. Try again.'
		);
	}
}
