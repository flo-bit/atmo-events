// A space credential and the reads made with it: a delegation token from the holder's
// PDS, exchanged at the authority's host for a credential bound to a fresh P-256 key,
// which signs every request (RFC 9421). A record read also checks the MAC (./space-mac.ts).
import { P256PrivateKeyExportable, type P256PrivateKey } from '@atcute/crypto';
import type { Did } from '@atcute/lexicons';
import { createActorResolver, createDidDocumentResolver } from '@svelte-atproto/oauth/network';
import { spaceRecordUri } from '../uri';
import { fetchOtherServer, timeLimitedNetwork } from './other-servers';
import { answerError, readXrpc, type XrpcHandle } from './xrpc';
import { MAC_HEADER, recordCid, recordMacCheck, WANT_MAC_HEADER } from './space-mac';

const describeFailure = (answer: { status: number; error: string | null }) =>
	`${answer.status}${answer.error ? ` ${answer.error}` : ''}`;

const SIGNATURE_LABEL = 'atproto-space-credential';
const AUTH_SCHEME = 'Atproto-Space-Credential';
export const GET_RECORD = 'com.atproto.space.getRecord';

export interface SpaceSigningKey {
	key: P256PrivateKey;
	keyId: string;
}

export interface SpaceCredential {
	/** Never logged. */
	token: string;
	signer: SpaceSigningKey;
}

export interface SpaceHolder {
	handle: XrpcHandle;
}

/** An answer, not an outage: the holder may not read the space. */
export class SpaceAccessDenied extends Error {
	constructor(
		readonly space: string,
		readonly reason: string
	) {
		super(`not let into ${space}: ${reason}`);
		this.name = 'SpaceAccessDenied';
	}
}

export function isSpaceAccessDenied(e: unknown): e is SpaceAccessDenied {
	return e instanceof SpaceAccessDenied;
}

const DENIED: Record<string, true> = {
	ScopeMissingError: true,
	UserNotAuthorized: true,
	AppNotAuthorized: true,
	NotAuthorized: true,
	// A PDS answers this for a refusal, and also when the authority's access check could not be
	// reached: a reason to hide the space, never to act on it.
	SpaceNotFound: true,
	// The authority deleted the space: nothing there to read, and no reason to retry.
	SpaceDeleted: true
};

function refusal(space: string, answer: { status: number; error: string | null }) {
	return answer.error && DENIED[answer.error]
		? new SpaceAccessDenied(space, describeFailure(answer))
		: null;
}

export interface SpaceHosts {
	repoHost(did: string): Promise<string>;
	/** `fresh` after a MAC that did not verify, since the key may have rotated. */
	kemKey(did: string, fresh?: boolean): Promise<string>;
}

function toBase64(bytes: Uint8Array): string {
	let out = '';
	for (const byte of bytes) out += String.fromCharCode(byte);
	return btoa(out);
}

export async function spaceSigHeaders(
	signer: SpaceSigningKey,
	authorization: string,
	audience: string
): Promise<Record<string, string>> {
	const params = `("authorization" "atproto-space-audience");tag="${SIGNATURE_LABEL}"`;
	const lines = [
		`"authorization": ${authorization}`,
		`"atproto-space-audience": ${audience}`,
		`"@signature-params": ${params}`
	];
	const signature = await signer.key.sign(new TextEncoder().encode(lines.join('\n')));
	return {
		authorization,
		'atproto-space-audience': audience,
		'signature-input': `${SIGNATURE_LABEL}=${params}`,
		signature: `${SIGNATURE_LABEL}=:${toBase64(signature)}:`
	};
}

export async function exchangeSpaceCredential(
	holder: SpaceHolder,
	space: string,
	authorityHost: string
): Promise<SpaceCredential> {
	const delegated = await holder.handle(
		`/xrpc/com.atproto.space.getDelegationToken?${new URLSearchParams({ space })}`,
		{ method: 'GET' }
	);
	const delegation = await readXrpc(delegated);
	if (!delegation.ok) {
		throw (
			refusal(space, delegation) ?? answerError('com.atproto.space.getDelegationToken', delegation)
		);
	}
	const { token } = delegation.data;
	if (typeof token !== 'string') {
		throw new Error('com.atproto.space.getDelegationToken returned no token');
	}

	const key = await P256PrivateKeyExportable.createKeypair();
	const signer: SpaceSigningKey = { key, keyId: await key.exportPublicKey('did') };
	const res = await fetchOtherServer(
		new URL('/xrpc/com.atproto.space.getSpaceCredential', authorityHost),
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ space, credentialKid: signer.keyId, delegationToken: token })
		}
	);
	const issued = await readXrpc(res);
	if (!issued.ok) {
		throw refusal(space, issued) ?? answerError('com.atproto.space.getSpaceCredential', issued);
	}
	const { credential } = issued.data;
	if (typeof credential !== 'string') {
		throw new Error('com.atproto.space.getSpaceCredential returned no credential');
	}
	return { token: credential, signer };
}

export function clearSpaceLookups() {
	identities.clear();
	resolved.clear();
}

export function spaceAuthority(space: string): string {
	const did = space.startsWith('at://') ? space.slice('at://'.length).split('/')[0] : '';
	if (!did.startsWith('did:')) throw new Error(`not a space URI: ${space}`);
	return did;
}

export type SpaceCall = {
	host: string;
	audience: string;
	nsid: string;
	query: Record<string, string>;
};

/** A record comes back only when it is the one asked for and its MAC and CID check. */
export async function fetchWithCredential(
	cred: SpaceCredential,
	hosts: SpaceHosts,
	call: SpaceCall
): Promise<Response> {
	const url = new URL(`/xrpc/${call.nsid}?${new URLSearchParams(call.query)}`, call.host);
	const headers = await spaceSigHeaders(cred.signer, `${AUTH_SCHEME} ${cred.token}`, call.audience);
	if (call.nsid !== GET_RECORD) return fetchOtherServer(url, { method: 'GET', headers });

	const { space, repo, collection, rkey } = call.query;
	const uri = spaceRecordUri(space, repo, collection, rkey);
	for (let attempt = 0; ; attempt++) {
		const mac = await recordMacCheck(await hosts.kemKey(repo, attempt > 0));
		const res = await fetchOtherServer(url, {
			method: 'GET',
			headers: { ...headers, [WANT_MAC_HEADER]: mac.header }
		});
		if (!res.ok) return res;
		const body = (await res.clone().json()) as { uri?: unknown; cid?: unknown; value?: unknown };
		if (body.uri !== uri) {
			throw new Error(`${GET_RECORD} at ${call.host} answered ${String(body.uri)} for ${uri}`);
		}
		const cid = String(body.cid ?? '');
		if (await mac.verify({ uri, cid }, res.headers.get(MAC_HEADER))) {
			if ((await recordCid(body.value).catch(() => null)) !== cid) {
				throw new Error(`${GET_RECORD} at ${call.host}: the value of ${uri} is not its CID's`);
			}
			return res;
		}
		if (attempt > 0) {
			throw new Error(`${GET_RECORD} at ${call.host}: the MAC of ${uri} does not verify`);
		}
	}
}

const RESOLVED_TTL_MS = 10 * 60 * 1000;
let actorResolver: ReturnType<typeof createActorResolver> | undefined;
let didResolver: ReturnType<typeof createDidDocumentResolver> | undefined;
const resolveDid = (did: string) =>
	(didResolver ??= createDidDocumentResolver({ network: timeLimitedNetwork() })).resolve(
		did as Did<'plc'> | Did<'web'>
	);
const identities = new Map<string, { value: SpaceIdentity; at: number }>();
const resolved = new Map<string, { value: string; at: number }>();

export interface SpaceIdentity {
	pds: string;
	/** `handle.invalid` unless the handle points back at the DID. */
	handle: string;
}

export async function spaceIdentity(did: string): Promise<SpaceIdentity> {
	const hit = identities.get(did);
	if (hit && Date.now() - hit.at < RESOLVED_TTL_MS) return hit.value;

	actorResolver ??= createActorResolver({ network: timeLimitedNetwork() });
	const { pds, handle } = await actorResolver.resolve(did as Did<'plc'> | Did<'web'>);
	const value = { pds, handle };
	identities.set(did, { value, at: Date.now() });
	return value;
}

async function kemKey(did: string, fresh = false): Promise<string> {
	const cacheKey = `${did}|#atproto_kem`;
	const hit = resolved.get(cacheKey);
	if (!fresh && hit && Date.now() - hit.at < RESOLVED_TTL_MS) return hit.value;

	const doc = await resolveDid(did);
	const method = doc.verificationMethod?.find(
		(m) => m.id === '#atproto_kem' || m.id === `${doc.id}#atproto_kem`
	);
	const multibase = method && 'publicKeyMultibase' in method ? method.publicKeyMultibase : null;
	if (typeof multibase !== 'string') throw new Error(`${did} names no #atproto_kem key`);
	const key = `did:key:${multibase}`;
	resolved.set(cacheKey, { value: key, at: Date.now() });
	return key;
}

export const didSpaceHosts: SpaceHosts = {
	repoHost: async (did) => (await spaceIdentity(did)).pds,
	kemKey
};
