// A space credential and the reads made with it: a delegation token from the holder's
// PDS, exchanged at the authority's host for a credential bound to a fresh P-256 key,
// which signs every request (RFC 9421, by @atproto/space). A record read also checks the
// MAC (./space-mac.ts).
import type { Did } from '@atcute/lexicons';
import { P256Keypair } from '@atproto/crypto';
import { createSpaceSigHeaders } from '@atproto/space';
import { createActorResolver, createDidDocumentResolver } from '@svelte-atproto/oauth/network';
import { spaceRecordUri } from '../uri';
import { fetchOtherServer, timeLimitedNetwork } from './other-servers';
import { answerError, readXrpc, type XrpcHandle } from './xrpc';
import { MAC_REQUEST_HEADER, recordCid, recordMacCheck } from './space-mac';

const describeFailure = (answer: { status: number; error: string | null }) =>
	`${answer.status}${answer.error ? ` ${answer.error}` : ''}`;

const AUTH_SCHEME = 'Atproto-Space-Credential';
export const GET_RECORD = 'com.atproto.space.getRecord';
const AUTHORIZE_SYNC = 'com.atproto.space.authorizeSpaceSync';

export interface SpaceCredential {
	/** Never logged. */
	token: string;
	/** The key the credential is bound to, which signs each use of it. */
	signer: P256Keypair;
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
	AccountNotAuthorized: true,
	AppNotAuthorized: true,
	NotAuthorized: true,
	// A PDS answers this for an account it refuses, so as not to say whether the space exists: a
	// reason to hide the space, never to act on it. A managing app it cannot reach is an outage.
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

	const signer = await P256Keypair.create();
	const res = await fetchOtherServer(new URL(`/xrpc/${AUTHORIZE_SYNC}`, authorityHost), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ space, credentialKey: signer.did(), delegationToken: token })
	});
	const issued = await readXrpc(res);
	if (!issued.ok) {
		throw refusal(space, issued) ?? answerError(AUTHORIZE_SYNC, issued);
	}
	const { credential } = issued.data;
	if (typeof credential !== 'string') {
		throw new Error(`${AUTHORIZE_SYNC} returned no credential`);
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
	const { headers } = await createSpaceSigHeaders({
		authorization: `${AUTH_SCHEME} ${cred.token}`,
		audience: call.audience as Did,
		keypair: cred.signer
	});
	if (call.nsid !== GET_RECORD) return fetchOtherServer(url, { method: 'GET', headers });

	const { space, repo, collection, rkey } = call.query;
	const uri = spaceRecordUri(space, repo, collection, rkey);
	for (let attempt = 0; ; attempt++) {
		const mac = await recordMacCheck(await hosts.kemKey(repo, attempt > 0));
		const res = await fetchOtherServer(url, {
			method: 'GET',
			headers: { ...headers, [MAC_REQUEST_HEADER]: mac.header }
		});
		if (!res.ok) return res;
		const body = (await res.clone().json()) as { uri?: unknown; cid?: unknown; value?: unknown };
		if (body.uri !== uri) {
			throw new Error(`${GET_RECORD} at ${call.host} answered ${String(body.uri)} for ${uri}`);
		}
		const cid = String(body.cid ?? '');
		if (mac.verify({ uri, cid }, res.headers)) {
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
