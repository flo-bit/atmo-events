import { P256PrivateKey, parsePrivateMultikey } from '@atcute/crypto';
import type { Did } from '@atcute/lexicons';

type Env = App.Platform['env'];

/** True when the deployment is configured to send/receive atmo.pub notifications. */
export function notifyConfigured(env: Env): boolean {
	return !!env.ATMO_NOTIFY_PRIVATE_KEY && !!env.OAUTH_PUBLIC_URL;
}

/** Our app's `did:web`, derived from the public origin so it always matches the
 *  DID document served at `<origin>/.well-known/did.json`. */
export function getSenderDid(env: Env): Did {
	if (!env.OAUTH_PUBLIC_URL) throw new Error('OAUTH_PUBLIC_URL is not set');
	return `did:web:${new URL(env.OAUTH_PUBLIC_URL).host}` as Did;
}

// The imported keypair is cached per process (re-imported only if the secret
// rotates). importRaw is async (WebCrypto), so callers await getKeypair().
let cached: { multikey: string; keypair: P256PrivateKey } | null = null;

export async function getKeypair(env: Env): Promise<P256PrivateKey> {
	const multikey = env.ATMO_NOTIFY_PRIVATE_KEY;
	if (!multikey) throw new Error('ATMO_NOTIFY_PRIVATE_KEY secret is not set');
	if (cached?.multikey === multikey) return cached.keypair;

	const parsed = parsePrivateMultikey(multikey);
	if (parsed.type !== 'p256') {
		throw new Error(`ATMO_NOTIFY_PRIVATE_KEY must be a P-256 multikey, got ${parsed.type}`);
	}
	const keypair = await P256PrivateKey.importRaw(parsed.privateKeyBytes);
	cached = { multikey, keypair };
	return keypair;
}

/** Public key as a multibase string for the DID document's `publicKeyMultibase`. */
export async function getPublicMultikey(env: Env): Promise<string> {
	return (await getKeypair(env)).exportPublicKey('multikey');
}
