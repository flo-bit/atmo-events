import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import { PREFERRED_CLIENT_COLLECTION, PREFERRED_CLIENT_RKEY } from '@atmo-dev/kit/social';

/** Read directly from the viewer's PDS; no appview indexing is required. */
export async function getPreferredClientRecord(client: Client, did: Did) {
	const response = await client.get('com.atproto.repo.getRecord', {
		params: { repo: did, collection: PREFERRED_CLIENT_COLLECTION, rkey: PREFERRED_CLIENT_RKEY }
	});
	if (!response.ok) {
		if (response.data.error === 'RecordNotFound') return null;
		throw new Error('Could not load preferred social app');
	}
	return { record: response.data.value, cid: response.data.cid };
}
