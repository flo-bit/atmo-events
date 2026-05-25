import { getPublicMultikey, getSenderDid, notifyConfigured } from './keypair';
import { SERVICE_URL } from '../spaces/config';

type Env = App.Platform['env'];

/**
 * The `did:web` document served at `<origin>/.well-known/did.json`, so the atmo
 * relay can resolve our DID and verify the app tokens we sign. Returns null when
 * notifications aren't configured (no signing key) — the caller should 404.
 */
export async function buildDidDocument(env: Env): Promise<Record<string, unknown> | null> {
	if (!notifyConfigured(env)) return null;

	const did = getSenderDid(env);
	const origin = env.OAUTH_PUBLIC_URL;
	const publicKeyMultibase = await getPublicMultikey(env);

	const service: Record<string, unknown>[] = [
		{ id: '#atmo_notify', type: 'AtmoNotifsSender', serviceEndpoint: origin }
	];
	// Keep the spaces service entry when this origin is also the spaces host
	// (e.g. a dev tunnel), so publishing the DID doc here doesn't drop it.
	if (SERVICE_URL && new URL(SERVICE_URL).host === new URL(origin).host) {
		service.push({ id: '#event_space', type: 'AtmoSpaceService', serviceEndpoint: SERVICE_URL });
	}

	return {
		'@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
		id: did,
		verificationMethod: [
			{ id: `${did}#atproto`, type: 'Multikey', controller: did, publicKeyMultibase }
		],
		service
	};
}
