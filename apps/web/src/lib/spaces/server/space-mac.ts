// The MAC a repo host puts on a space record read with a credential: the reader sends a
// one-off P-256 key in `atproto-space-want-mac`, the host answers with an HMAC of the
// record's URI and CID under a secret derived from its `#atproto_kem` key, DHKEM(P-256,
// HKDF-SHA256) as in RFC 9180 § 4.1. The reader also checks the value against that CID.
import { encode } from '@atcute/cbor';
import { CODEC_DCBOR, create, fromString, toString } from '@atcute/cid';
import { P256PublicKey, parseDidKey } from '@atcute/crypto';

export const WANT_MAC_HEADER = 'atproto-space-want-mac';
export const MAC_HEADER = 'atproto-space-mac';
const RECORD_MAC_TYPE = 'atproto-space-record';
const RECORD_MAC_VERSION = 1;

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

const utf8 = (text: string) => new TextEncoder().encode(text);
const uint16be = (n: number) => Uint8Array.of(n >> 8, n & 0xff);

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

function lengthPrefixed(text: string): Uint8Array {
	const bytes = utf8(text);
	return concat([uint16be(bytes.length), bytes]);
}

// RFC 9180's labels. 0x0010 names DHKEM(P-256, HKDF-SHA256).
const KEM_PREFIX = concat([utf8('HPKE-v1'), utf8('KEM'), uint16be(0x0010)]);

export async function ecdhPublicKey(
	didKey: string
): Promise<{ key: CryptoKey; point: Uint8Array }> {
	const found = parseDidKey(didKey);
	if (found.type !== 'p256') throw new Error(`not a P-256 key: ${didKey}`);
	const { x, y } = await (
		await P256PublicKey.importRaw(found.publicKeyBytes)
	).exportPublicKey('jwk');
	const key = await crypto.subtle.importKey(
		'jwk',
		{ kty: 'EC', crv: 'P-256', x, y },
		ECDH,
		true,
		[]
	);
	return { key, point: new Uint8Array(await crypto.subtle.exportKey('raw', key)) };
}

export async function sharedSecret(
	dh: Uint8Array,
	reader: Uint8Array,
	repo: Uint8Array
): Promise<Uint8Array<ArrayBuffer>> {
	const ikm = concat([KEM_PREFIX, utf8('eae_prk'), dh]);
	const info = concat([uint16be(32), KEM_PREFIX, utf8('shared_secret'), reader, repo]);
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info },
		key,
		256
	);
	return new Uint8Array(bits);
}

/** The CID of a record's DRISL encoding. */
export async function recordCid(value: unknown): Promise<string> {
	return toString(await create(CODEC_DCBOR, encode(value)));
}

export async function recordMac(secret: Uint8Array<ArrayBuffer>, uri: string, cid: string) {
	const key = await crypto.subtle.importKey(
		'raw',
		secret,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const data = concat([
		utf8(`${RECORD_MAC_TYPE}-v${RECORD_MAC_VERSION}`),
		lengthPrefixed(uri),
		fromString(cid).bytes
	]);
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

function macFromHeader(value: string | null): Uint8Array | null {
	if (!value) return null;
	const fields = new Map(
		value.split(',').map((member) => {
			const eq = member.indexOf('=');
			return [member.slice(0, eq).trim(), member.slice(eq + 1).trim()] as const;
		})
	);
	if (fields.get('type') !== `"${RECORD_MAC_TYPE}"`) return null;
	if (fields.get('ver') !== String(RECORD_MAC_VERSION)) return null;
	const mac = /^:([A-Za-z0-9+/]*={0,2}):$/.exec(fields.get('mac') ?? '');
	return mac ? Uint8Array.from(atob(mac[1]), (c) => c.charCodeAt(0)) : null;
}

/** Made per request, since each takes a key of its own. */
export interface RecordMacCheck {
	header: string;
	verify(record: { uri: string; cid: string }, macHeader: string | null): Promise<boolean>;
}

/** Tests pass `ephemeral` to fix the request's key. */
export async function recordMacCheck(
	repoKemKey: string,
	ephemeral?: CryptoKeyPair
): Promise<RecordMacCheck> {
	const repo = await ecdhPublicKey(repoKemKey);
	const pair =
		ephemeral ?? ((await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair);
	const reader = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	const keyShare = await (await P256PublicKey.importRaw(reader)).exportPublicKey('did');
	const dh = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: repo.key },
		pair.privateKey,
		256
	);
	const secret = await sharedSecret(new Uint8Array(dh), reader, repo.point);
	return {
		header: `type="${RECORD_MAC_TYPE}", ver=${RECORD_MAC_VERSION}, key_share="${keyShare}"`,
		async verify({ uri, cid }, macHeader) {
			const got = macFromHeader(macHeader);
			// A CID that does not parse cannot be the record's, so nothing matches it.
			const want = got && (await recordMac(secret, uri, cid).catch(() => null));
			if (!got || !want) return false;
			let diff = got.length ^ want.length;
			for (let i = 0; i < want.length; i++) diff |= want[i] ^ (got[i] ?? 0);
			return diff === 0;
		}
	};
}
