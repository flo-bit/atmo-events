import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P256Keypair } from '@atproto/crypto';
import type { AtprotoNetwork } from '@svelte-atproto/oauth/network';
import {
	clearSpaceLookups,
	didSpaceHosts,
	exchangeSpaceCredential,
	isSpaceAccessDenied,
	SpaceAccessDenied,
	type SpaceHolder,
	type SpaceHosts
} from './space-credential';
import { credentialSpaceReader } from './space-read';
import { fakeKemHost, type FakeKemHost } from './__fixtures__/space-mac-host';
import { recordCid } from './space-mac';
import { spaceRecordUri, spaceUri } from '../uri';

// The network object keeps the fetch it is made with, and these tests stub a new one each time.
const net = vi.hoisted(() => ({ current: null as AtprotoNetwork | null }));
vi.mock('#lib/atproto/network.js', async () => {
	const { createAtprotoNetwork } = await import('@svelte-atproto/oauth/network');
	const standard = createAtprotoNetwork({ fetch: (input, init) => globalThis.fetch(input, init) });
	return { atprotoNetwork: () => net.current ?? standard };
});

const GROUP_DID = 'did:plc:jcwgw6fcnb5vyoid7nz7sl26';
const BOB = 'did:plc:hkymspvcjhy6sbujuydfj7sv';
const VIEWER = 'did:plc:viewerviewerviewerviewer';
const MEMBERS = spaceUri(GROUP_DID, 'com.example.forum', 'self');
const GROUP_HOST = 'https://group.pds.test';

const kem = await fakeKemHost();
const hosts: SpaceHosts = { repoHost: async () => GROUP_HOST, kemKey: async () => kem.did };

const CREDENTIAL_SIG_INPUT =
	'("authorization" "atproto-space-audience");tag="atproto-space-credential"';

/** atmo never looks inside a credential, so the fake one only names who it was issued to. */
const credentialFor = (holder: string | undefined) => `credential-for-${holder}`;

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

/** A fixed key for the credential, private scalar 0x22…22, with its did:key and public JWK
 *  as @atproto/space wrote them in the alpha image sha256:3ebb6d0e. */
const SIGNER = new Uint8Array(32).fill(0x22);
const SIGNER_DID = 'did:key:zDnaex62me84JZnkEzmeYRa8FCLNe7y1asoSwBMK26GBYpL7c';
const SIGNER_JWK = {
	kty: 'EC',
	crv: 'P-256',
	x: '1lqTl3yqPRsIGFL_V6eeRl8WYFdzBLrq1QXdOkhYnPM',
	y: 'UBheiVNy32Ih6joTdVfkc_3bZ1XwW9UHw8Uz_OnJEoU'
};

/** Whether a request's signature verifies under `jwk`, with WebCrypto rather than the
 *  package that signed it, over the authorization and the audience it was sent with. */
async function signedWith(jwk: JsonWebKey, headers: Headers): Promise<boolean> {
	const match = /^sig=:([A-Za-z0-9+/=]+):$/.exec(headers.get('signature') ?? '');
	if (!match) return false;
	const signature = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
	expect(signature.length).toBe(64);
	const base = [
		`"authorization": ${headers.get('authorization')}`,
		`"atproto-space-audience": ${headers.get('atproto-space-audience')}`,
		`"@signature-params": ${CREDENTIAL_SIG_INPUT}`
	].join('\n');
	const publicKey = await crypto.subtle.importKey(
		'jwk',
		jwk,
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

type ExchangeBody = { space?: unknown; credentialKey?: unknown; delegationToken?: unknown };

/** A holder's session answers `getDelegationToken` with a token naming them; the group's
 *  host exchanges it for a credential naming them and answers `getRecord`. */
function network(options: {
	answer?: (headers: Headers) => Response | null | Promise<Response | null>;
	delegate?: () => Response | null;
	exchange?: () => Response | null;
	/** `listWriters` pages, by the cursor asked with ('' for the first). */
	writers?: Record<string, unknown>;
}) {
	const delegations: string[] = [];
	const exchanges: { headers: Headers; body: ExchangeBody }[] = [];
	const reads: { url: URL; headers: Headers }[] = [];
	const listed: URL[] = [];

	const holder: SpaceHolder = {
		handle: async (pathname) => {
			delegations.push(pathname);
			return (
				options.delegate?.() ?? json(200, { token: `delegation-${VIEWER}-${delegations.length}` })
			);
		}
	};

	vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
		const url = new URL(String(input));
		const headers = new Headers(init?.headers);
		if (url.pathname === '/xrpc/com.atproto.space.authorizeSpaceSync') {
			const body = JSON.parse(String(init?.body)) as ExchangeBody;
			exchanges.push({ headers, body });
			const refused = options.exchange?.();
			if (refused) return refused;
			const issuedTo = /^delegation-(did:[^-]+)-/.exec(String(body.delegationToken))?.[1];
			return json(200, { credential: credentialFor(issuedTo) });
		}
		if (url.pathname === '/xrpc/com.atproto.space.getRecord') {
			reads.push({ url, headers });
			const q = url.searchParams;
			const overridden = await options.answer?.(headers);
			if (overridden) return overridden;
			return recordResponse(kem, headers, {
				uri: spaceRecordUri(q.get('space')!, q.get('repo')!, q.get('collection')!, q.get('rkey')!),
				value: { n: 1 }
			});
		}
		if (url.pathname === '/xrpc/com.atproto.space.listWriters') {
			listed.push(url);
			const page = options.writers?.[url.searchParams.get('cursor') ?? ''];
			return json(200, page ?? { repos: [] });
		}
		return json(404, { error: 'NotFound' });
	});

	return { holder, delegations, exchanges, reads, listed };
}

const READ = { space: MEMBERS, repo: GROUP_DID, collection: 'x.y.z', rkey: 'self' };
const readAs = (holder: SpaceHolder) => credentialSpaceReader(holder, hosts).get(READ);

beforeEach(() => clearSpaceLookups());
afterEach(() => vi.unstubAllGlobals());

describe('exchangeSpaceCredential', () => {
	it("gets a delegation token through the holder's own session, then a credential for a new key, both named in the body", async () => {
		const net = network({});
		const cred = await exchangeSpaceCredential(net.holder, MEMBERS, GROUP_HOST);

		expect(net.delegations).toEqual([
			`/xrpc/com.atproto.space.getDelegationToken?${new URLSearchParams({ space: MEMBERS })}`
		]);
		expect(net.exchanges).toHaveLength(1);
		const [exchange] = net.exchanges;
		expect(cred.signer.did()).toMatch(/^did:key:zDn/);
		expect(exchange.body).toEqual({
			space: MEMBERS,
			credentialKey: cred.signer.did(),
			delegationToken: `delegation-${VIEWER}-1`
		});
		expect(exchange.headers.get('authorization')).toBeNull();
		expect(exchange.headers.get('signature')).toBeNull();
		expect(cred.token).toBe(credentialFor(VIEWER));
	});

	it.each([
		['the holder’s session does not read the space', 'delegate', 403, 'ScopeMissingError'],
		['the authority does not let the holder in', 'exchange', 400, 'AccountNotAuthorized'],
		['the authority does not let the app in', 'exchange', 400, 'AppNotAuthorized'],
		['the authority does not say which it refused', 'exchange', 400, 'NotAuthorized'],
		// The spaces alpha answers this for an account it refuses, so as not to say the space exists.
		['the authority hides whether the space exists', 'exchange', 400, 'SpaceNotFound']
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

	it('reads a deleted space as a refusal, not an outage', async () => {
		const net = network({ exchange: () => json(400, { error: 'SpaceDeleted' }) });
		await expect(readAs(net.holder)).rejects.toSatisfy(isSpaceAccessDenied);
	});
});

describe('a read with a credential', () => {
	it('is signed for the repo by the credential’s own key, and asks for the record’s MAC', async () => {
		const net = network({});
		// The first key made is the credential's. The MAC check makes the next one.
		const made = vi
			.spyOn(P256Keypair, 'create')
			.mockResolvedValueOnce(await P256Keypair.import(SIGNER));
		await readAs(net.holder);
		made.mockRestore();

		const [exchange] = net.exchanges;
		expect(exchange.body.credentialKey).toBe(SIGNER_DID);
		const [read] = net.reads;
		expect(read.url.origin).toBe(GROUP_HOST);
		expect(read.headers.get('authorization')).toBe(
			`Atproto-Space-Credential ${credentialFor(VIEWER)}`
		);
		expect(read.headers.get('atproto-space-audience')).toBe(GROUP_DID);
		expect(read.headers.get('signature-input')).toBe(`sig=${CREDENTIAL_SIG_INPUT}`);
		expect(await signedWith(SIGNER_JWK, read.headers)).toBe(true);
		const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const otherJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
		expect(await signedWith(otherJwk, read.headers)).toBe(false);
		expect(read.headers.get('accept-signature')).toMatch(
			/^mac=\("atproto-space-record";sf\);keyid="did:key:zDn[1-9A-HJ-NP-Za-km-z]+";tag="atproto-space-record"$/
		);
	});
});

describe('a reader holds its credentials for one request', () => {
	it('shares one credential across its own reads', async () => {
		const net = network({});
		const reader = credentialSpaceReader(net.holder, hosts);
		await reader.get(READ);
		await reader.get(READ);
		expect(net.exchanges).toHaveLength(1);
	});

	it('asks again on the next request, so someone taken off a list loses access at once', async () => {
		const net = network({});
		await readAs(net.holder);
		await readAs(net.holder);
		expect(net.exchanges).toHaveLength(2);
	});
});

describe('exchanges under way', () => {
	const read = { space: MEMBERS, repo: GROUP_DID, collection: 'x.y.z', rkey: 'self' };
	it('reads that start together share one exchange, and a refusal reaches them all without asking again', async () => {
		const net = network({ exchange: () => json(400, { error: 'AccountNotAuthorized' }) });
		const reader = credentialSpaceReader(net.holder, hosts);
		const reads = [reader.get(read), reader.get(read), reader.writers(MEMBERS)];
		for (const pending of reads) await expect(pending).rejects.toBeInstanceOf(SpaceAccessDenied);
		expect(net.delegations).toHaveLength(1);
		expect(net.exchanges).toHaveLength(1);
	});

	it('an exchange an earlier request left under way is never waited on by the next', async () => {
		const net = network({});
		let abandoned = false;
		const holder: SpaceHolder = {
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

describe('the writers of a space', () => {
	const WRITE = 'com.atproto.space.defs#repoWrite';
	const REMOVED = 'com.atproto.space.defs#repoRemoved';
	const GUEST = 'did:plc:guestguestguestguestgues';
	const written = (repo: string, spaceRev: string) => ({
		$type: WRITE,
		repo,
		repoRev: '3mwcj3b6uak2f',
		data: { $bytes: 'AAAA' },
		spaceRev
	});

	it('counts the repos on the writer set, and leaves out one taken off it', async () => {
		const net = network({
			writers: {
				'': {
					repos: [
						written(BOB, '3mwcj3b6uak2a'),
						{ $type: REMOVED, repo: GUEST, spaceRev: '3mwcj3b6uak2b' }
					],
					cursor: '3mwcj3b6uak2b'
				}
			}
		});
		expect(await credentialSpaceReader(net.holder, hosts).writers(MEMBERS)).toEqual([BOB]);
		const [first] = net.listed;
		expect(first.origin).toBe(GROUP_HOST);
		expect(first.searchParams.get('space')).toBe(MEMBERS);
	});

	it('counts no entry that is not a write, such as the shape listRepos gave', async () => {
		const net = network({
			writers: { '': { repos: [{ did: BOB, rev: '3mwcj3b6uak2f' }, { repo: GUEST }] } }
		});
		expect(await credentialSpaceReader(net.holder, hosts).writers(MEMBERS)).toEqual([]);
	});

	it('leaves out a repo taken off the writer set while the pages are read', async () => {
		const net = network({
			writers: {
				'': { repos: [written(GUEST, '3mwcj3b6uak2a')], cursor: '3mwcj3b6uak2a' },
				'3mwcj3b6uak2a': {
					repos: [
						written(BOB, '3mwcj3b6uak2b'),
						{ $type: REMOVED, repo: GUEST, spaceRev: '3mwcj3b6uak2c' }
					],
					cursor: '3mwcj3b6uak2c'
				}
			}
		});
		expect(await credentialSpaceReader(net.holder, hosts).writers(MEMBERS)).toEqual([BOB]);
	});

	it('reads every page, and counts a repo once', async () => {
		const net = network({
			writers: {
				'': { repos: [written(BOB, '3mwcj3b6uak2a')], cursor: '3mwcj3b6uak2a' },
				'3mwcj3b6uak2a': {
					repos: [written(GUEST, '3mwcj3b6uak2c'), written(BOB, '3mwcj3b6uak2d')],
					cursor: '3mwcj3b6uak2d'
				}
			}
		});
		expect(await credentialSpaceReader(net.holder, hosts).writers(MEMBERS)).toEqual([BOB, GUEST]);
		expect(net.listed.map((url) => url.searchParams.get('cursor'))).toEqual([
			null,
			'3mwcj3b6uak2a',
			'3mwcj3b6uak2d'
		]);
	});
});

describe('a record read with a credential', () => {
	const read = { space: MEMBERS, repo: GROUP_DID, collection: 'x.y.z', rkey: 'self' };
	const record = { uri: `${MEMBERS}/${GROUP_DID}/x.y.z/self`, value: { n: 1 } };
	const readWith = (answer: Parameters<typeof network>[0]['answer'], at = hosts) => {
		const net = network({ answer });
		return { net, pending: credentialSpaceReader(net.holder, at).get(read) };
	};

	it('returns the record when its MAC verifies and its value is its CID’s', async () => {
		const { pending } = readWith((headers) => recordResponse(kem, headers, record));
		expect(await pending).toMatchObject({ uri: record.uri, value: record.value });
	});

	it('never returns a record with no MAC, or with a MAC from another key', async () => {
		const other = await fakeKemHost();
		for (const mac of [null, other]) {
			const { pending } = readWith((headers) => recordResponse(mac, headers, record));
			await expect(pending).rejects.toThrow();
		}
	});

	it('never returns a value its CID does not name, though the MAC verifies', async () => {
		const { pending } = readWith(async (headers) => {
			const answered = await recordResponse(kem, headers, record);
			const body = (await answered.json()) as Record<string, unknown>;
			return json(200, { ...body, value: { n: 2 } }, Object.fromEntries(answered.headers));
		});
		await expect(pending).rejects.toThrow();
	});

	it('never returns another record than the one asked for, though its MAC verifies', async () => {
		const { pending } = readWith(async (headers) => {
			const answered = await recordResponse(kem, headers, record);
			const body = (await answered.json()) as Record<string, unknown>;
			const other = `${MEMBERS}/${GROUP_DID}/x.y.z/other`;
			return json(200, { ...body, uri: other }, Object.fromEntries(answered.headers));
		});
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
		const { net, pending } = readWith((headers) => recordResponse(kem, headers, record), rotated);
		expect(await pending).toMatchObject({ uri: record.uri });
		expect(asked).toEqual([false, true]);
		const shares = net.reads.map((r) => r.headers.get('accept-signature'));
		expect(shares).toHaveLength(2);
		expect(shares[0]).not.toBe(shares[1]);
	});
});

describe('calls to servers other people chose', () => {
	const realTimeout = AbortSignal.timeout.bind(AbortSignal);
	/** Never answers, and stops when told to, as a real fetch does. */
	const neverAnswers = (_input: unknown, init?: RequestInit) =>
		new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
		});
	/** Only the first step answers, so what stalls is the step after it. */
	const onlyExchanges = () => {
		const exchange = globalThis.fetch;
		vi.stubGlobal('fetch', (input: URL | string, init?: RequestInit) =>
			String(input).includes('authorizeSpaceSync')
				? exchange(input, init)
				: neverAnswers(input, init)
		);
	};

	beforeEach(() => {
		vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
	});
	afterEach(() => {
		vi.restoreAllMocks();
		net.current = null;
	});

	it('gives up on a host that never answers the exchange', { timeout: 1000 }, async () => {
		const { holder } = network({});
		vi.stubGlobal('fetch', neverAnswers);
		await expect(exchangeSpaceCredential(holder, MEMBERS, GROUP_HOST)).rejects.toBeDefined();
	});

	it('gives up on a server that never answers a read', { timeout: 1000 }, async () => {
		const { holder } = network({});
		onlyExchanges();
		const reader = credentialSpaceReader(holder, hosts);
		await expect(reader.get(READ)).rejects.toBeDefined();
	});

	it('gives up on a host that never lists who has written', { timeout: 1000 }, async () => {
		const { holder } = network({});
		onlyExchanges();
		const reader = credentialSpaceReader(holder, hosts);
		await expect(reader.writers(MEMBERS)).rejects.toBeDefined();
	});

	it('gives up on a did:web that never answers', { timeout: 1000 }, async () => {
		vi.stubGlobal('fetch', neverAnswers);
		await expect(didSpaceHosts.repoHost('did:web:stalled.test')).rejects.toBeDefined();
	});

	it('finds a PDS in the DID document, and asks once', async () => {
		const lookup = vi.fn(async () =>
			json(200, {
				'@context': ['https://www.w3.org/ns/did/v1'],
				id: 'did:web:someone.test',
				service: [
					{
						id: '#atproto_pds',
						type: 'AtprotoPersonalDataServer',
						serviceEndpoint: 'https://pds.someone.test'
					}
				]
			})
		);
		vi.stubGlobal('fetch', lookup);
		const first = await didSpaceHosts.repoHost('did:web:someone.test');
		const again = await didSpaceHosts.repoHost('did:web:someone.test');
		expect(new URL(first).origin).toBe('https://pds.someone.test');
		expect(again).toBe(first);
		expect(lookup).toHaveBeenCalledOnce();
	});

	it('does not follow a redirect, which would take the delegation token elsewhere', async () => {
		const { holder } = network({});
		const reached: string[] = [];
		const redirecting = async (input: URL | string, init?: RequestInit): Promise<Response> => {
			const url = new URL(String(input));
			reached.push(url.origin);
			if (url.origin === 'https://elsewhere.test') return json(200, { credential: 'stolen' });
			if (init?.redirect === 'manual') {
				return new Response(null, {
					status: 302,
					headers: { location: 'https://elsewhere.test/' }
				});
			}
			return redirecting('https://elsewhere.test/', init);
		};
		vi.stubGlobal('fetch', redirecting);
		await expect(exchangeSpaceCredential(holder, MEMBERS, GROUP_HOST)).rejects.toBeDefined();
		expect(reached).toEqual([GROUP_HOST]);
	});

	it.each(['http://plain.test', 'https://name:word@pds.test'])(
		'sends no delegation token to %s',
		async (host) => {
			const { holder } = network({});
			const sent = vi.fn();
			vi.stubGlobal('fetch', sent);
			await expect(exchangeSpaceCredential(holder, MEMBERS, host)).rejects.toBeDefined();
			expect(sent).not.toHaveBeenCalled();
		}
	);

	it('sends no signed read to a repo whose server is not https', async () => {
		const { holder, reads } = network({});
		const mixed: SpaceHosts = {
			repoHost: async (did) => (did === GROUP_DID ? GROUP_HOST : 'http://plain.test'),
			kemKey: async () => kem.did
		};
		const reader = credentialSpaceReader(holder, mixed);
		await expect(reader.get({ ...READ, repo: BOB })).rejects.toBeDefined();
		expect(reads).toHaveLength(0);
	});

	it('keeps to an isolated network, which may use http', async () => {
		const { createAtprotoNetwork } = await import('@svelte-atproto/oauth/network');
		const sent = vi.fn(async () => json(200, { credential: credentialFor(VIEWER) }));
		net.current = createAtprotoNetwork({
			mode: 'isolated',
			namespace: 'test',
			allowedOrigins: ['http://inside.test'],
			plc: 'http://inside.test',
			doh: 'http://inside.test',
			sandbox: { httpOrigins: ['http://inside.test'], fetch: sent }
		});
		const { holder } = network({});
		await expect(
			exchangeSpaceCredential(holder, MEMBERS, 'http://inside.test')
		).resolves.toBeDefined();
		await expect(
			exchangeSpaceCredential(holder, MEMBERS, 'http://outside.test')
		).rejects.toBeDefined();
		expect(sent).toHaveBeenCalledOnce();
	});
});
