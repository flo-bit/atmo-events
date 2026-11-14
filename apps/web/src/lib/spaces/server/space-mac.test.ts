// Checked against values made outside @atproto/space. The keys are the cfrg HPKE test vector for
// DHKEM(P-256, HKDF-SHA256), HKDF-SHA256 and the export-only AEAD, base mode
// (github.com/cfrg/draft-irtf-cfrg-hpke test-vectors.json). An HPKE export written here first
// reproduces that vector's own export, then gives the secret for proposal 0016's info
// "atproto-mac", and the MAC is an RFC 9421 HMAC signature built here over the
// `Atproto-Space-Record` header. So a version of the package that derives the secret, asks for
// the MAC or reads it differently fails here.
import { P256Keypair } from '@atproto/crypto';
import { createRecordMacHeaders, decapsulate } from '@atproto/space';
import { parseCid } from '@atproto/lex-data';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordMacCheck } from './space-mac';

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (bytes: Uint8Array) =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const utf8 = (text: string) => new TextEncoder().encode(text);
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64url = (bytes: Uint8Array) =>
	base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const concat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
};
const u16 = (n: number) => Uint8Array.of(n >> 8, n & 0xff);

// mode 0, kem_id 16, kdf_id 1, aead_id 0xffff.
const VECTOR = {
	info: hex('4f6465206f6e2061204772656369616e2055726e'),
	skEm: hex('2f18b059576a0ec5a17121c0fe7ec8f00ea86f7b046fa3889ac8f21f89dbd484'),
	pkEm: hex(
		'04d804370b7e24b94749eb1dc8df6d4d4a5d75f9effad01739ebcad5c54a40d57aaa8b4190fc124dbde2e4f1e1d1b012a3bc4038157dc29b55533a932306d8d38d'
	),
	skRm: hex('62c3868357a464f8461d03aa0182c7cebcde841036aea7230ddc7339f1088346'),
	pkRm: hex(
		'046c6bb9e1976402c692fef72552f4aaeedd83a5e5079de3d7ae732da0f397b15921fb9c52c9866affc8e29c0271a35937023a9245982ec18bab1eb157cf16fc33'
	),
	sharedSecret: '7e5b6dd51bca56d4f30c95ff658af26c08eb0c073aa7180686cc4dbeabcb34f1',
	/** exporter_context empty, L 32. */
	exported: '8cf837d5bf1994f0fac3ee1faa671d07e9a38b7f6153bdbb8a66b90159ef7d13'
};

const RECORD = {
	uri: 'at://did:plc:24sh6i7iuw4wqpqztvnzztob/space/group.opensocial.members/self/did:plc:24sh6i7iuw4wqpqztvnzztob/group.opensocial.acceptance/self',
	cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm'
};

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	const k = await crypto.subtle.importKey(
		'raw',
		key as Uint8Array<ArrayBuffer>,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as Uint8Array<ArrayBuffer>));
}

// RFC 9180 §4 and §5, for one suite and 32-byte outputs (one HKDF-Expand block). An empty salt
// is HashLen zeros (RFC 5869), which WebCrypto needs spelled out.
const KEM_ID = concat(utf8('KEM'), u16(0x0010));
const SUITE_ID = concat(utf8('HPKE'), u16(0x0010), u16(0x0001), u16(0xffff));
const EMPTY = new Uint8Array(0);
const labeledExtract = (id: Uint8Array, salt: Uint8Array, label: string, ikm: Uint8Array) =>
	hmac(salt.length ? salt : new Uint8Array(32), concat(utf8('HPKE-v1'), id, utf8(label), ikm));
const labeledExpand = async (id: Uint8Array, prk: Uint8Array, label: string, info: Uint8Array) =>
	hmac(prk, concat(u16(32), utf8('HPKE-v1'), id, utf8(label), info, Uint8Array.of(1)));

async function ecdh(sk: Uint8Array, ownPk: Uint8Array, peerPk: Uint8Array): Promise<Uint8Array> {
	const priv = await crypto.subtle.importKey(
		'jwk',
		{
			kty: 'EC',
			crv: 'P-256',
			d: base64url(sk),
			x: base64url(ownPk.slice(1, 33)),
			y: base64url(ownPk.slice(33))
		},
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		['deriveBits']
	);
	const pub = await crypto.subtle.importKey(
		'raw',
		peerPk as Uint8Array<ArrayBuffer>,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
}

/** The sender's side: KEM shared secret, then an export with an empty exporter context. */
async function hpkeExport(info: Uint8Array) {
	const dh = await ecdh(VECTOR.skEm, VECTOR.pkEm, VECTOR.pkRm);
	const eaePrk = await labeledExtract(KEM_ID, EMPTY, 'eae_prk', dh);
	const kemSecret = await labeledExpand(
		KEM_ID,
		eaePrk,
		'shared_secret',
		concat(VECTOR.pkEm, VECTOR.pkRm)
	);
	const context = concat(
		Uint8Array.of(0),
		await labeledExtract(SUITE_ID, EMPTY, 'psk_id_hash', EMPTY),
		await labeledExtract(SUITE_ID, EMPTY, 'info_hash', info)
	);
	const secret = await labeledExtract(SUITE_ID, kemSecret, 'secret', EMPTY);
	const exporterSecret = await labeledExpand(SUITE_ID, secret, 'exp', context);
	return { kemSecret, exported: await labeledExpand(SUITE_ID, exporterSecret, 'sec', EMPTY) };
}

/** A host's answer: the record header and an HMAC signature over it, under the label `mac`. */
async function macHeaders(secret: Uint8Array, keyShare: string, record = RECORD) {
	const covered = `uri="${record.uri}", cid="${record.cid}"`;
	const params = `("atproto-space-record";sf);keyid="${keyShare}";tag="atproto-space-record"`;
	const base = `"atproto-space-record";sf: ${covered}\n"@signature-params": ${params}`;
	return new Headers({
		'atproto-space-record': covered,
		'signature-input': `mac=${params}`,
		signature: `mac=:${base64(await hmac(secret, utf8(base)))}:`
	});
}

/** The request key is the vector's sender key, the repo's KEM key its recipient key. */
async function vectorCheck() {
	const request = await P256Keypair.import(VECTOR.skEm);
	const repo = await P256Keypair.import(VECTOR.skRm);
	vi.spyOn(P256Keypair, 'create').mockResolvedValueOnce(request);
	return { check: await recordMacCheck(repo.did()), keyShare: request.did(), repo };
}

afterEach(() => vi.restoreAllMocks());

describe('recordMacCheck', () => {
	it('starts from an HPKE export that reproduces the cfrg vector', async () => {
		const { kemSecret, exported } = await hpkeExport(VECTOR.info);
		expect(toHex(kemSecret)).toBe(VECTOR.sharedSecret);
		expect(toHex(exported)).toBe(VECTOR.exported);
	});

	it('asks for a record MAC keyed by its own key share', async () => {
		const { check, keyShare } = await vectorCheck();
		expect(check.header).toBe(
			`mac=("atproto-space-record";sf);keyid="${keyShare}";tag="atproto-space-record"`
		);
	});

	it('accepts a MAC over the record under the "atproto-mac" export of the two keys', async () => {
		const { check, keyShare } = await vectorCheck();
		const { exported } = await hpkeExport(utf8('atproto-mac'));
		expect(check.verify(RECORD, await macHeaders(exported, keyShare))).toBe(true);
	});

	it('accepts the MAC @atproto/space computes as the repo host', async () => {
		const { check, keyShare, repo } = await vectorCheck();
		const { headers } = createRecordMacHeaders(RECORD.uri as never, parseCid(RECORD.cid), {
			label: 'mac',
			keyShare: keyShare as never,
			signatureParams: check.header.slice('mac='.length),
			sharedSecret: decapsulate(repo, keyShare as never)
		});
		expect(check.verify(RECORD, new Headers(headers))).toBe(true);
	});

	it('refuses it for another record, another CID, or a MAC made for another request', async () => {
		const { check, keyShare } = await vectorCheck();
		const { exported } = await hpkeExport(utf8('atproto-mac'));
		const mac = await macHeaders(exported, keyShare);
		expect(check.verify({ ...RECORD, uri: `${RECORD.uri}x` }, mac)).toBe(false);
		expect(
			check.verify(
				{ ...RECORD, cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpa' },
				mac
			)
		).toBe(false);
		const fresh = await recordMacCheck((await P256Keypair.import(VECTOR.skRm)).did());
		expect(fresh.header).not.toBe(check.header);
		expect(fresh.verify(RECORD, mac)).toBe(false);
		// The secret of the old exchange (plain DHKEM), not the export.
		const { kemSecret } = await hpkeExport(utf8('atproto-mac'));
		expect(check.verify(RECORD, await macHeaders(kemSecret, keyShare))).toBe(false);
	});

	it('refuses an answer with no MAC, one for a commit, or a CID that does not parse', async () => {
		const { check, keyShare } = await vectorCheck();
		const { exported } = await hpkeExport(utf8('atproto-mac'));
		const mac = await macHeaders(exported, keyShare);
		expect(check.verify(RECORD, new Headers())).toBe(false);
		const commit = new Headers();
		mac.forEach((value, name) =>
			commit.set(name, value.replaceAll('atproto-space-record', 'atproto-space-commit'))
		);
		expect(check.verify(RECORD, commit)).toBe(false);
		expect(check.verify({ ...RECORD, cid: 'Qmnotbase32' }, mac)).toBe(false);
	});
});
