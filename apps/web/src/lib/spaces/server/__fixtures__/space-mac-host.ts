// A repo host's side of the record MAC (../space-mac.ts), for fakes: one KEM key that
// every fake repo publishes as `#atproto_kem`, and a record read's answer as a host gives
// it, computed by @atproto/space as on a real host. The reader's side is checked against
// values computed outside the package in ../space-mac.test.ts.
import { P256Keypair } from '@atproto/crypto';
import { parseCid } from '@atproto/lex-data';
import {
	createRecordMacHeaders,
	decapsulate,
	parseMacRequest,
	RECORD_MAC_PROFILE,
	SpaceMacError
} from '@atproto/space';

import { MAC_REQUEST_HEADER, recordCid } from '../space-mac';

type AtUriString = Parameters<typeof createRecordMacHeaders>[0];

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

function macRequestOf(request: Headers) {
	try {
		return parseMacRequest(request.get(MAC_REQUEST_HEADER) ?? undefined, RECORD_MAC_PROFILE);
	} catch (e) {
		if (e instanceof SpaceMacError) return undefined;
		throw e;
	}
}

export async function fakeKemHost(): Promise<FakeKemHost> {
	const pair = await P256Keypair.create();
	const did = pair.did();
	return {
		did,
		multibase: did.slice('did:key:'.length),
		async recordAnswer(request, { uri, cid, value }): ReturnType<FakeKemHost['recordAnswer']> {
			const asked = macRequestOf(request);
			if (!asked) return { cid, headers: {} };
			const real = await recordCid(value);
			const sharedSecret = decapsulate(pair, asked.keyShare);
			const { headers } = createRecordMacHeaders(uri as AtUriString, parseCid(real), {
				...asked,
				sharedSecret
			});
			return { cid: real, headers };
		}
	};
}
