// The MAC a repo host puts on a space record read with a credential, as an HTTP message
// signature (RFC 9421): the reader asks for it in `Accept-Signature` with a one-off P-256 key,
// and the host answers with an `Atproto-Space-Record` header naming the record's URI and CID,
// signed with HMAC under a secret both derive (HPKE secret export) from that key and the repo's
// `#atproto_kem` key. @atproto/space does the key exchange, the request and the check. The
// reader also checks the value against that CID.
import { encode } from '@atcute/cbor';
import { CODEC_DCBOR, create, toString } from '@atcute/cid';
import { parseCidSafe } from '@atproto/lex-data';
import {
	encapsulate,
	formatMacRequest,
	RECORD_MAC_PROFILE,
	SpaceMacError,
	verifyRecordMac
} from '@atproto/space';

// @atproto/syntax's string brands, without depending on it directly.
type DidString = Parameters<typeof encapsulate>[0];
type AtUriString = Parameters<typeof verifyRecordMac>[0];

/** The request header a reader asks for the MAC in. */
export const MAC_REQUEST_HEADER = 'accept-signature';

/** The CID of a record's DRISL encoding. `getRecord` answers in JSON, and @atcute/cbor reads
 *  its `$link` and `$bytes` as a link and bytes, as the repo host did. */
export async function recordCid(value: unknown): Promise<string> {
	return toString(await create(CODEC_DCBOR, encode(value)));
}

/** Made per request, since each takes a key of its own. */
export interface RecordMacCheck {
	/** The `Accept-Signature` value. */
	header: string;
	/** Whether the answer carries a MAC for this request that names this record. */
	verify(record: { uri: string; cid: string }, answer: Headers): boolean;
}

export async function recordMacCheck(repoKemKey: string): Promise<RecordMacCheck> {
	const encapsulation = await encapsulate(repoKemKey as DidString);
	return {
		header: formatMacRequest(RECORD_MAC_PROFILE, encapsulation.keyShare),
		verify({ uri, cid }, answer) {
			// A CID that does not parse cannot be the record's, so nothing matches it.
			const parsed = parseCidSafe(cid);
			if (!parsed) return false;
			try {
				verifyRecordMac(uri as AtUriString, parsed, { ...encapsulation, headers: answer });
				return true;
			} catch (e) {
				// None, malformed, for another request or record, or for a commit.
				if (e instanceof SpaceMacError) return false;
				throw e;
			}
		}
	};
}
