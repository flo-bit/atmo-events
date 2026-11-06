// Every expected value here was computed by @atproto/space (decapsulate, computeRecordMac,
// formatWantMacHeader, formatMacHeader) in the alpha image sha256:3ebb6d0e, from the two
// fixed keys below, not by the code tested.
import { describe, expect, it } from 'vitest';

import { recordMacCheck } from './space-mac';

const REPO_KEM_KEY = 'did:key:zDnaeQa8zprPhHA7Yuxcgc2Uh6XNQgaKjmFZE4EaA9fk5svmJ';
/** The request's own key, private scalar 0x22…22. */
const EPHEMERAL = {
	kty: 'EC',
	crv: 'P-256',
	x: '1lqTl3yqPRsIGFL_V6eeRl8WYFdzBLrq1QXdOkhYnPM',
	y: 'UBheiVNy32Ih6joTdVfkc_3bZ1XwW9UHw8Uz_OnJEoU',
	d: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI'
};
const RECORD = {
	uri: 'at://did:plc:24sh6i7iuw4wqpqztvnzztob/space/group.opensocial.members/self/did:plc:24sh6i7iuw4wqpqztvnzztob/group.opensocial.acceptance/self',
	cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm'
};
const WANT =
	'type="atproto-space-record", ver=1, key_share="did:key:zDnaex62me84JZnkEzmeYRa8FCLNe7y1asoSwBMK26GBYpL7c"';
const MAC =
	'type="atproto-space-record", ver=1, mac=:sJjfUqOgnziWAzGFWUoXUjiPtpVnW+VqfBD7jnaY1sE=:';

async function fixedEphemeral(): Promise<CryptoKeyPair> {
	const alg = { name: 'ECDH', namedCurve: 'P-256' };
	const { kty, crv, x, y } = EPHEMERAL;
	return {
		privateKey: await crypto.subtle.importKey('jwk', EPHEMERAL, alg, false, ['deriveBits']),
		publicKey: await crypto.subtle.importKey('jwk', { kty, crv, x, y }, alg, true, [])
	};
}

describe('recordMacCheck', () => {
	it('asks for the MAC as @atproto/space formats the request', async () => {
		const check = await recordMacCheck(REPO_KEM_KEY, await fixedEphemeral());
		expect(check.header).toBe(WANT);
	});

	it('accepts the MAC the repo host computes for the record', async () => {
		const check = await recordMacCheck(REPO_KEM_KEY, await fixedEphemeral());
		expect(await check.verify(RECORD, MAC)).toBe(true);
	});

	it('refuses it for another record, another CID, or a MAC made for another request', async () => {
		const check = await recordMacCheck(REPO_KEM_KEY, await fixedEphemeral());
		expect(await check.verify({ ...RECORD, uri: `${RECORD.uri}x` }, MAC)).toBe(false);
		expect(
			await check.verify(
				{ ...RECORD, cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpa' },
				MAC
			)
		).toBe(false);
		const fresh = await recordMacCheck(REPO_KEM_KEY);
		expect(fresh.header).not.toBe(WANT);
		expect(await fresh.verify(RECORD, MAC)).toBe(false);
	});

	it('refuses an answer with no MAC, or one for a commit or another version', async () => {
		const check = await recordMacCheck(REPO_KEM_KEY, await fixedEphemeral());
		expect(await check.verify(RECORD, null)).toBe(false);
		expect(
			await check.verify(RECORD, MAC.replace('atproto-space-record', 'atproto-space-repo'))
		).toBe(false);
		expect(await check.verify(RECORD, MAC.replace('ver=1', 'ver=2'))).toBe(false);
		expect(await check.verify({ ...RECORD, cid: 'Qmnotbase32' }, MAC)).toBe(false);
	});
});
