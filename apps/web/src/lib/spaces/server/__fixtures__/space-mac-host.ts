// A repo host's side of the record MAC (../space-mac.ts), for fakes: one KEM key
// that every fake repo publishes as `#atproto_kem`, and a record read's answer as a
// host gives it. The derivation itself is checked against @atproto/space in
// ../space-mac.test.ts.
import { P256PublicKey } from '@atcute/crypto';

import {
	ecdhPublicKey,
	MAC_HEADER,
	recordCid,
	recordMac,
	sharedSecret,
	WANT_MAC_HEADER
} from '../space-mac';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface FakeKemHost {
	/** The key as a did:key, what `SpaceHosts.kemKey` resolves to. */
	did: string;
	/** The key as a DID document's `publicKeyMultibase`. */
	multibase: string;
	/** A record read's CID and headers. A read that asks for a MAC gets what a
	 *  host serves it: the value's real CID and the MAC over it. Any other keeps
	 *  the fake's CID and gets no MAC. */
	recordAnswer(
		request: Headers,
		record: { uri: string; cid: string; value: unknown }
	): Promise<{ cid: string; headers: Record<string, string> }>;
}

export async function fakeKemHost(): Promise<FakeKemHost> {
	const pair = (await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
	const point = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	const did = await (await P256PublicKey.importRaw(point)).exportPublicKey('did');
	return {
		did,
		multibase: did.slice('did:key:'.length),
		async recordAnswer(request, { uri, cid, value }): ReturnType<FakeKemHost['recordAnswer']> {
			const keyShare = /key_share="([^"]+)"/.exec(request.get(WANT_MAC_HEADER) ?? '')?.[1];
			if (!keyShare) return { cid, headers: {} };
			const reader = await ecdhPublicKey(keyShare);
			const dh = await crypto.subtle.deriveBits(
				{ name: 'ECDH', public: reader.key },
				pair.privateKey,
				256
			);
			const secret = await sharedSecret(new Uint8Array(dh), reader.point, point);
			const real = await recordCid(value);
			const mac = btoa(String.fromCharCode(...(await recordMac(secret, uri, real))));
			return {
				cid: real,
				headers: { [MAC_HEADER]: `type="atproto-space-record", ver=1, mac=:${mac}:` }
			};
		}
	};
}

/** A key the shared fixtures can publish for every DID, so any of their hosts can MAC any of
 *  their records. */
export const fixtureKem = fakeKemHost();
