import type { Did } from '@atcute/lexicons';
import { getProfileFromContrail, getProfileBlobUrl, getServerClient } from '$lib/contrail';

export async function loadProfile(did: Did, db: D1Database) {
	try {
		const client = getServerClient(db);
		const p = await getProfileFromContrail(client, did);

		if (!p) {
			return { did, handle: did };
		}

		return {
			did: p.did,
			handle: p.handle && p.handle !== 'handle.invalid' ? p.handle : did,
			displayName: p.value?.displayName,
			avatar: p.value?.avatar ? getProfileBlobUrl(p.did, p.value.avatar) : undefined
		};
	} catch (e) {
		console.error('Failed to load profile:', e);
		return undefined;
	}
}
