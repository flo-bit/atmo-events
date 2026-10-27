import { getPublicMultikey, getSenderDid, notifyConfigured } from './keypair';

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

	return {
		'@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
		id: did,
		verificationMethod: [
			{ id: `${did}#atproto`, type: 'Multikey', controller: did, publicKeyMultibase }
		],
		service
	};
}
