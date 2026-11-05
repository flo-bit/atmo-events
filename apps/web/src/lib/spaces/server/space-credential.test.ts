import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P256PrivateKeyExportable } from '@atcute/crypto';
import {
	clearSpaceCredentials,
	exchangeSpaceCredential,
	isSpaceAccessDenied,
	SpaceAccessDenied,
	spaceCredential,
	spaceSigHeaders,
	type SpaceHolder,
	type SpaceHosts,
	type SpaceSigningKey
} from './space-credential';
import { credentialSpaceReader } from './space-read';
import { fakeKemHost, type FakeKemHost } from './__fixtures__/space-mac-host';
import { recordCid } from './space-mac';
import { spaceRecordUri, spaceUri } from '../uri';

const GROUP_DID = 'did:plc:jcwgw6fcnb5vyoid7nz7sl26';
const BOB = 'did:plc:hkymspvcjhy6sbujuydfj7sv';
const VIEWER = 'did:plc:viewerviewerviewerviewer';
const CAROL = 'did:plc:6cz6dldz42itymdbte47ewcv';
const MALLORY = 'did:plc:ib2wrjcp4ulwqu35a7rtlckv';
const MEMBERS = spaceUri(GROUP_DID, 'com.example.forum', 'self');
const GROUP_HOST = 'https://group.pds.test';

const kem = await fakeKemHost();
const hosts: SpaceHosts = { repoHost: async () => GROUP_HOST, kemKey: async () => kem.did };

const CREDENTIAL_SIG_INPUT =
	'("authorization" "atproto-space-audience");tag="atproto-space-credential"';

function base64url(text: string): string {
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(payload: Record<string, unknown>): string {
	return `${base64url(JSON.stringify({ typ: 'atproto-space-credential+jwt' }))}.${base64url(JSON.stringify(payload))}.c2ln`;
}

function payloadOf(credential: string): { n?: unknown; holder?: unknown } | null {
	try {
		const payload = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		return JSON.parse(atob(payload + '='.repeat((4 - (payload.length % 4)) % 4)));
	} catch {
		return null;
	}
}

function serial(credential: string): number | null {
	const n = payloadOf(credential)?.n;
	return typeof n === 'number' ? n : null;
}

function holderOf(credential: string): string | null {
	const holder = payloadOf(credential)?.holder;
	return typeof holder === 'string' ? holder : null;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}

async function recordResponse(
	host: FakeKemHost | null,
	request: Headers,
	record: { uri: string; value: unknown }
): Promise<Response> {
	const answered = host
		? await host.recordAnswer(request, { ...record, cid: 'bafytest' })
		: { cid: await recordCid(record.value), headers: {} };
	return json(200, { ...record, cid: answered.cid }, answered.headers);
}

async function verifies(signer: SpaceSigningKey, base: string, header: string): Promise<boolean> {
	const match = /^atproto-space-credential=:([A-Za-z0-9+/=]+):$/.exec(header);
	if (!match) return false;
	const signature = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
	expect(signature.length).toBe(64);
	const publicKey = await crypto.subtle.importKey(
		'jwk',
		await signer.key.exportPublicKey('jwk'),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify']
	);
	return crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		publicKey,
		signature,
		new TextEncoder().encode(base)
	);
}

async function newSigner(): Promise<SpaceSigningKey> {
	const key = await P256PrivateKeyExportable.createKeypair();
	return { key, keyId: await key.exportPublicKey('did') };
}

describe('spaceSigHeaders', () => {
	it('signs a credential use over the authorization and the audience, as @atproto/space does', async () => {
		const signer = await newSigner();
		const headers = await spaceSigHeaders(signer, 'Atproto-Space-Credential cred.jwt', BOB);

		expect(headers.authorization).toBe('Atproto-Space-Credential cred.jwt');
		expect(headers['atproto-space-audience']).toBe(BOB);
		expect(headers['signature-input']).toBe(`atproto-space-credential=${CREDENTIAL_SIG_INPUT}`);
		const base = [
			'"authorization": Atproto-Space-Credential cred.jwt',
			`"atproto-space-audience": ${BOB}`,
			`"@signature-params": ${CREDENTIAL_SIG_INPUT}`
		].join('\n');
		expect(await verifies(signer, base, headers.signature)).toBe(true);
	});
});

type ExchangeBody = { space?: unknown; credentialKid?: unknown; delegationToken?: unknown };

/** A holder's session answers `getDelegationToken` with a token naming them; the group's
 *  host exchanges it for a credential naming them and answers `getRecord`. */
function network(options: {
	answer?: (
		did: string,
		credential: string,
		headers: Headers
	) => Response | null | Promise<Response | null>;
	delegate?: () => Response | null;
	exchange?: () => Response | null;
	lifetimeMs?: number;
}) {
	let issued = 0;
	const delegations: string[] = [];
	const exchanges: { headers: Headers; body: ExchangeBody }[] = [];
	const reads: { url: URL; headers: Headers }[] = [];

	const holderFor = (did: string): SpaceHolder => ({
		did,
		handle: async (pathname) => {
			delegations.push(pathname);
			return (
				options.delegate?.() ?? json(200, { token: `delegation-${did}-${delegations.length}` })
			);
		}
	});

	vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
		const url = new URL(String(input));
		const headers = new Headers(init?.headers);
		if (url.pathname === '/xrpc/com.atproto.space.getSpaceCredential') {
			const body = JSON.parse(String(init?.body)) as ExchangeBody;
			exchanges.push({ headers, body });
			const refused = options.exchange?.();
			if (refused) return refused;
			issued++;
			const exp = Math.floor((Date.now() + (options.lifetimeMs ?? 600_000)) / 1000);
			const holder = /^delegation-(did:[^-]+)-/.exec(String(body.delegationToken))?.[1];
			return json(200, { credential: jwt({ exp, n: issued, holder }) });
		}
		if (url.pathname === '/xrpc/com.atproto.space.getRecord') {
			reads.push({ url, headers });
			const q = url.searchParams;
			const credential = (headers.get('authorization') ?? '').replace(
				/^Atproto-Space-Credential /,
				''
			);
			const overridden = await options.answer?.(q.get('repo') ?? '', credential, headers);
			if (overridden) return overridden;
			return recordResponse(kem, headers, {
				uri: spaceRecordUri(q.get('space')!, q.get('repo')!, q.get('collection')!, q.get('rkey')!),
				value: { n: 1 }
			});
		}
		return json(404, { error: 'NotFound' });
	});

	return { holder: holderFor(VIEWER), holderFor, delegations, exchanges, reads };
}

const READ = { space: MEMBERS, repo: GROUP_DID, collection: 'x.y.z', rkey: 'self' };
const readAs = (holder: SpaceHolder) => credentialSpaceReader(holder, hosts).get(READ);

// A test past its timeout keeps running. A long one sets this, and the next test waits for it,
// so the exchange it has under way cannot land in the next test's fetch.
let stopping: Promise<unknown> = Promise.resolve();

beforeEach(() => clearSpaceCredentials());
afterEach(async () => {
	await stopping;
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('exchangeSpaceCredential', () => {
	it("gets a delegation token through the holder's own session, then a credential for a new key, both named in the body", async () => {
		const net = network({});
		const cred = await exchangeSpaceCredential(net.holder, MEMBERS, GROUP_HOST);

		expect(net.delegations).toEqual([
			`/xrpc/com.atproto.space.getDelegationToken?${new URLSearchParams({ space: MEMBERS })}`
		]);
		expect(net.exchanges).toHaveLength(1);
		const [exchange] = net.exchanges;
		expect(cred.signer.keyId).toMatch(/^did:key:zDn/);
		expect(exchange.body).toEqual({
			space: MEMBERS,
			credentialKid: cred.signer.keyId,
			delegationToken: `delegation-${VIEWER}-1`
		});
		expect(exchange.headers.get('authorization')).toBeNull();
		expect(exchange.headers.get('signature')).toBeNull();
		expect(cred.expiresAt).toBeGreaterThan(Date.now());
		expect(holderOf(cred.token)).toBe(VIEWER);
	});

	it.each([
		['the holder’s session does not read the space', 'delegate', 403, 'ScopeMissingError'],
		['the authority does not let the holder in', 'exchange', 400, 'UserNotAuthorized'],
		['the authority does not let the app in', 'exchange', 400, 'AppNotAuthorized'],
		['the authority does not say which it refused', 'exchange', 400, 'NotAuthorized']
	] as const)('throws SpaceAccessDenied when %s', async (_why, step, status, error) => {
		const refusal = () => json(status, { error, message: 'refused' });
		const net = network(step === 'delegate' ? { delegate: refusal } : { exchange: refusal });

		const thrown = await exchangeSpaceCredential(net.holder, MEMBERS, GROUP_HOST).catch((e) => e);

		expect(thrown).toBeInstanceOf(SpaceAccessDenied);
		expect(isSpaceAccessDenied(thrown)).toBe(true);
		expect((thrown as SpaceAccessDenied).space).toBe(MEMBERS);
		expect((thrown as SpaceAccessDenied).reason).toBe(`${status} ${error}`);
		expect(net.exchanges).toHaveLength(step === 'delegate' ? 0 : 1);
	});

	it('throws a plain error, not SpaceAccessDenied, for a refusal that does not name the holder', async () => {
		for (const options of [
			{ delegate: () => json(400, { error: 'InvalidToken' }) },
			{ exchange: () => json(502, { error: 'UpstreamFailure' }) }
		]) {
			const net = network(options);
			const thrown = await exchangeSpaceCredential(net.holder, MEMBERS, GROUP_HOST).catch((e) => e);
			expect(thrown).toBeInstanceOf(Error);
			expect(isSpaceAccessDenied(thrown)).toBe(false);
		}
	});

	// The spaces alpha refuses a person the host turns away with SpaceNotFound, and answers
	// the same when it cannot reach the host's access check.
	it('reads SpaceNotFound as a refusal it cannot be sure of', async () => {
		const net = network({ exchange: () => json(400, { error: 'SpaceNotFound' }) });
		const thrown = await exchangeSpaceCredential(net.holder, MEMBERS, GROUP_HOST).catch((e) => e);
		expect(isSpaceAccessDenied(thrown)).toBe(true);
		expect((thrown as SpaceAccessDenied).ambiguous).toBe(true);
	});

	it('reads a deleted space as a refusal, not an outage', async () => {
		const net = network({ exchange: () => json(400, { error: 'SpaceDeleted' }) });
		await expect(readAs(net.holder)).rejects.toSatisfy(isSpaceAccessDenied);
	});

	it('reads a named refusal as certain', async () => {
		const net = network({ exchange: () => json(403, { error: 'UserNotAuthorized' }) });
		const thrown = await exchangeSpaceCredential(net.holder, MEMBERS, GROUP_HOST).catch((e) => e);
		expect((thrown as SpaceAccessDenied).ambiguous).toBe(false);
	});
});

describe('a read with a credential', () => {
	it('is signed for the repo and asks for the record’s MAC', async () => {
		const net = network({});
		await readAs(net.holder);

		const [read] = net.reads;
		expect(read.url.origin).toBe(GROUP_HOST);
		expect(read.headers.get('authorization')).toMatch(/^Atproto-Space-Credential /);
		expect(read.headers.get('atproto-space-audience')).toBe(GROUP_DID);
		expect(read.headers.get('signature-input')).toBe(
			`atproto-space-credential=${CREDENTIAL_SIG_INPUT}`
		);
		expect(read.headers.get('atproto-space-want-mac')).toMatch(
			/^type="atproto-space-record", ver=1, key_share="did:key:zDn[1-9A-HJ-NP-Za-km-z]+"$/
		);
	});

	it('keeps one credential until shortly before it expires, then makes a new key', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-04T10:00:00.000Z'));
		const net = network({});

		await readAs(net.holder);
		vi.setSystemTime(new Date('2026-10-04T10:09:00.000Z'));
		await readAs(net.holder);
		expect(net.exchanges).toHaveLength(1);

		vi.setSystemTime(new Date('2026-10-04T10:09:45.000Z'));
		await readAs(net.holder);
		expect(net.exchanges).toHaveLength(2);
		expect(net.exchanges[0].body.credentialKid).not.toBe(net.exchanges[1].body.credentialKid);
		expect(net.delegations).toHaveLength(2);
	});

	it('replaces a credential the host calls spent, once, and reads again', async () => {
		const net = network({
			answer: (_did, credential) =>
				serial(credential) === 1 ? json(401, { error: 'JwtExpired' }) : null
		});
		expect(await readAs(net.holder)).toMatchObject({ value: { n: 1 } });
		expect(net.exchanges).toHaveLength(2);
		expect(net.reads).toHaveLength(2);
	});

	it('keeps the credential when a PDS with no spaces support refuses the read', async () => {
		const net = network({ answer: () => json(401, { error: 'AuthMissing' }) });
		await expect(readAs(net.holder)).rejects.toThrow();
		await expect(readAs(net.holder)).rejects.toThrow();
		expect(net.exchanges).toHaveLength(1);
	});

	it('keeps each holder’s credential apart, so neither is served the other’s', async () => {
		const net = network({});
		for (const did of [CAROL, MALLORY, CAROL, MALLORY]) await readAs(net.holderFor(did));

		expect(net.exchanges.map((e) => e.body.delegationToken)).toEqual([
			`delegation-${CAROL}-1`,
			`delegation-${MALLORY}-2`
		]);
		const readers = net.reads.map((read) =>
			holderOf((read.headers.get('authorization') ?? '').replace(/^Atproto-Space-Credential /, ''))
		);
		expect(readers).toEqual([CAROL, MALLORY, CAROL, MALLORY]);
	});

	it('keeps a new sign-in that grants less apart from the credential an older one got', async () => {
		const net = network({});
		const wide = { ...net.holderFor(CAROL), scope: 'atproto space:*?authority=*&action=read' };
		const narrow = { ...net.holderFor(CAROL), scope: 'atproto' };
		await readAs(wide);
		await readAs(narrow);
		await readAs(wide);
		expect(net.exchanges).toHaveLength(2);
	});

	it('keeps at most 500 credentials, dropping the oldest', async ({ signal }) => {
		// The cap is in the credential cache, so this skips the 502 signed and MAC-checked reads.
		const net = network({});
		const holders = Array.from({ length: 501 }, (_, i) => net.holderFor(`did:plc:holder${i}`));
		const credentialFor = (holder: SpaceHolder) => spaceCredential(holder, MEMBERS, GROUP_HOST);
		const exchangeAll = (async () => {
			for (const holder of holders) {
				if (signal.aborted) return;
				await credentialFor(holder);
			}
		})();
		stopping = exchangeAll.catch(() => {});
		await exchangeAll;
		expect(net.exchanges).toHaveLength(501);

		await credentialFor(holders[500]);
		expect(net.exchanges).toHaveLength(501);
		await credentialFor(holders[0]);
		expect(net.exchanges).toHaveLength(502);
	});
});

describe('a reader that keeps no credential', () => {
	const freshReader = (holder: SpaceHolder) =>
		credentialSpaceReader(holder, hosts, { keepCredential: false });

	it('shares one credential across its own reads', async () => {
		const net = network({});
		const reader = freshReader(net.holder);
		await reader.get(READ);
		await reader.get(READ);
		expect(net.exchanges).toHaveLength(1);
	});

	it('asks again on the next request, so someone taken off a list loses access at once', async () => {
		const net = network({});
		await freshReader(net.holder).get(READ);
		await freshReader(net.holder).get(READ);
		expect(net.exchanges).toHaveLength(2);
	});

	it('leaves a kept credential alone', async () => {
		const net = network({});
		await readAs(net.holder);
		await freshReader(net.holder).get(READ);
		await readAs(net.holder);
		expect(net.exchanges).toHaveLength(2);
	});
});

describe('exchanges under way', () => {
	const read = { space: MEMBERS, repo: GROUP_DID, collection: 'x.y.z', rkey: 'self' };
	it('reads that start together share one exchange, and a refusal reaches them all without asking again', async () => {
		const net = network({ exchange: () => json(400, { error: 'UserNotAuthorized' }) });
		const reader = credentialSpaceReader(net.holder, hosts);
		const reads = [reader.get(read), reader.get(read), reader.list(read)];
		for (const pending of reads) await expect(pending).rejects.toBeInstanceOf(SpaceAccessDenied);
		expect(net.delegations).toHaveLength(1);
		expect(net.exchanges).toHaveLength(1);
	});

	it('an exchange an earlier request left under way is never waited on by the next', async () => {
		const net = network({});
		let abandoned = false;
		const holder: SpaceHolder = {
			did: VIEWER,
			handle: (pathname, init) => {
				if (abandoned) return net.holder.handle(pathname, init);
				abandoned = true;
				return new Promise<Response>(() => {});
			}
		};
		void credentialSpaceReader(holder, hosts)
			.get(read)
			.catch(() => {});

		expect(await credentialSpaceReader(holder, hosts).get(read)).toMatchObject({ value: { n: 1 } });
		expect(net.exchanges).toHaveLength(1);
	});
});

describe('a record read with a credential', () => {
	const read = { space: MEMBERS, repo: GROUP_DID, collection: 'x.y.z', rkey: 'self' };
	const record = { uri: `${MEMBERS}/${GROUP_DID}/x.y.z/self`, value: { n: 1 } };
	const readWith = (answer: Parameters<typeof network>[0]['answer'], at = hosts) => {
		clearSpaceCredentials();
		const net = network({ answer });
		return { net, pending: credentialSpaceReader(net.holder, at).get(read) };
	};

	it('returns the record when its MAC verifies and its value is its CID’s', async () => {
		const { pending } = readWith((_d, _c, headers) => recordResponse(kem, headers, record));
		expect(await pending).toMatchObject({ uri: record.uri, value: record.value });
	});

	it('never returns a record with no MAC, or with a MAC from another key', async () => {
		const other = await fakeKemHost();
		for (const mac of [null, other]) {
			const { pending } = readWith((_d, _c, headers) => recordResponse(mac, headers, record));
			await expect(pending).rejects.toThrow();
		}
	});

	it('never returns a value its CID does not name, though the MAC verifies', async () => {
		const { pending } = readWith(async (_d, _c, headers) => {
			const answered = await recordResponse(kem, headers, record);
			const body = (await answered.json()) as Record<string, unknown>;
			return json(200, { ...body, value: { n: 2 } }, Object.fromEntries(answered.headers));
		});
		await expect(pending).rejects.toThrow();
	});

	it('never returns another record than the one asked for, though its MAC verifies', async () => {
		const { pending } = readWith((_d, _c, headers) =>
			recordResponse(kem, headers, { ...record, uri: `${MEMBERS}/${GROUP_DID}/x.y.z/other` })
		);
		await expect(pending).rejects.toThrow();
	});

	it('reads the KEM key anew once when the MAC does not verify, as after a rotation', async () => {
		const stale = await fakeKemHost();
		const asked: boolean[] = [];
		const rotated: SpaceHosts = {
			...hosts,
			kemKey: async (_did, fresh = false) => {
				asked.push(fresh);
				return fresh ? kem.did : stale.did;
			}
		};
		const { net, pending } = readWith(
			(_d, _c, headers) => recordResponse(kem, headers, record),
			rotated
		);
		expect(await pending).toMatchObject({ uri: record.uri });
		expect(asked).toEqual([false, true]);
		const shares = net.reads.map((r) => r.headers.get('atproto-space-want-mac'));
		expect(shares).toHaveLength(2);
		expect(shares[0]).not.toBe(shares[1]);
	});
});
