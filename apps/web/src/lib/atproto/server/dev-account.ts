import { createHash } from 'node:crypto';
import { dev } from '$app/environment';
import { Client } from '@atcute/client';
import { Secp256k1PrivateKey } from '@atcute/crypto';
import type { Did } from '@atcute/lexicons';
import { DEV_PORT } from '../port';

/**
 * Local-only buyer used to exercise authenticated ticket checkout without
 * involving a real PDS or OAuth grant. The DID resolves back to this Vite
 * server, whose dev DID document exposes the matching deterministic test key.
 */
export const DEV_BUYER_DID = `did:web:localhost%3A${DEV_PORT}` as Did<'web'>;
export const DEV_BUYER_PROFILE = {
	did: DEV_BUYER_DID,
	handle: 'dev-buyer.atm.local',
	displayName: 'Dev Ticket Buyer'
};

const DEV_KEY_SEED = 'atmo-events:local-ticket-buyer:v1';
const JSON_HEADERS = { 'content-type': 'application/json' };

type DevRecord = {
	uri: string;
	cid: string;
	rkey: string;
	collection: string;
	value: Record<string, unknown>;
};

type DevAccountState = {
	records: Map<string, DevRecord>;
};

const globalState = globalThis as typeof globalThis & {
	__atmoEventsDevAccount?: DevAccountState;
};

function state(): DevAccountState {
	return (globalState.__atmoEventsDevAccount ??= { records: new Map() });
}

function assertDev(): void {
	if (!dev) throw new Error('The local dev account is unavailable outside development.');
}

let keyPromise: Promise<Secp256k1PrivateKey> | null = null;
function signingKey(): Promise<Secp256k1PrivateKey> {
	assertDev();
	return (keyPromise ??= Secp256k1PrivateKey.importRaw(
		createHash('sha256').update(DEV_KEY_SEED).digest()
	));
}

function base64url(value: string | Uint8Array): string {
	return Buffer.from(value).toString('base64url');
}

async function mintServiceAuthToken(aud: string, lxm: string): Promise<string> {
	const now = Math.floor(Date.now() / 1_000);
	const header = base64url(JSON.stringify({ alg: 'ES256K', typ: 'JWT', kid: '#atproto' }));
	const payload = base64url(
		JSON.stringify({
			iss: DEV_BUYER_DID,
			aud,
			lxm,
			iat: now,
			exp: now + 5 * 60,
			jti: crypto.randomUUID()
		})
	);
	const signingInput = `${header}.${payload}`;
	const signature = await (await signingKey()).sign(new TextEncoder().encode(signingInput));
	return `${signingInput}.${base64url(signature)}`;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function recordKey(collection: string, rkey: string): string {
	return `${collection}/${rkey}`;
}

function base32(bytes: Uint8Array): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
	let bits = 0;
	let value = 0;
	let output = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
	return output;
}

/** Syntactically valid CIDv1 used only by the in-memory local PDS. */
function cidFor(bytes: Uint8Array, codec: 0x55 | 0x71): string {
	const digest = createHash('sha256').update(bytes).digest();
	return `b${base32(Uint8Array.from([0x01, codec, 0x12, 0x20, ...digest]))}`;
}

function recordCid(record: Record<string, unknown>): string {
	return cidFor(new TextEncoder().encode(JSON.stringify(record)), 0x71);
}

async function devPdsHandler(pathname: string, init: RequestInit): Promise<Response> {
	assertDev();
	const url = new URL(pathname, 'http://dev-buyer.atm.local');
	const nsid = url.pathname.replace(/^\/xrpc\//, '');

	if (nsid === 'com.atproto.server.getServiceAuth' && init.method === 'get') {
		const aud = url.searchParams.get('aud');
		const lxm = url.searchParams.get('lxm');
		if (!aud || !lxm)
			return json({ error: 'InvalidRequest', message: 'aud and lxm are required' }, 400);
		return json({ token: await mintServiceAuthToken(aud, lxm) });
	}

	if (init.method === 'post' && nsid === 'com.atproto.repo.putRecord') {
		const input = JSON.parse(String(init.body)) as {
			collection: string;
			rkey: string;
			record: Record<string, unknown>;
		};
		const uri = `at://${DEV_BUYER_DID}/${input.collection}/${input.rkey}`;
		const cid = recordCid(input.record);
		state().records.set(recordKey(input.collection, input.rkey), {
			uri,
			cid,
			rkey: input.rkey,
			collection: input.collection,
			value: input.record
		});
		return json({ uri, cid });
	}

	if (init.method === 'post' && nsid === 'com.atproto.repo.createRecord') {
		const input = JSON.parse(String(init.body)) as {
			collection: string;
			rkey?: string;
			record: Record<string, unknown>;
		};
		const rkey = input.rkey ?? crypto.randomUUID().replaceAll('-', '').slice(0, 13);
		const uri = `at://${DEV_BUYER_DID}/${input.collection}/${rkey}`;
		const cid = recordCid(input.record);
		state().records.set(recordKey(input.collection, rkey), {
			uri,
			cid,
			rkey,
			collection: input.collection,
			value: input.record
		});
		return json({ uri, cid });
	}

	if (init.method === 'get' && nsid === 'com.atproto.repo.getRecord') {
		const collection = url.searchParams.get('collection');
		const rkey = url.searchParams.get('rkey');
		if (!collection || !rkey) {
			return json({ error: 'InvalidRequest', message: 'collection and rkey are required' }, 400);
		}
		const record = state().records.get(recordKey(collection, rkey));
		if (!record) return json({ error: 'RecordNotFound', message: 'Record not found' }, 400);
		return json({ uri: record.uri, cid: record.cid, value: record.value });
	}

	if (init.method === 'post' && nsid === 'com.atproto.repo.uploadBlob') {
		const body = init.body;
		const bytes =
			body instanceof Blob
				? new Uint8Array(await body.arrayBuffer())
				: new TextEncoder().encode(typeof body === 'string' ? body : 'local-dev-blob');
		const mimeType =
			body instanceof Blob ? body.type || 'application/octet-stream' : 'application/octet-stream';
		return json({
			blob: {
				$type: 'blob',
				ref: { $link: cidFor(bytes, 0x55) },
				mimeType,
				size: bytes.byteLength
			}
		});
	}

	if (init.method === 'post' && nsid === 'com.atproto.repo.deleteRecord') {
		const input = JSON.parse(String(init.body)) as { collection: string; rkey: string };
		state().records.delete(recordKey(input.collection, input.rkey));
		return json({});
	}

	return json({ error: 'MethodNotImplemented', message: `${init.method} ${nsid}` }, 400);
}

export function isDevBuyerDid(did: string | null | undefined): did is typeof DEV_BUYER_DID {
	return dev && did === DEV_BUYER_DID;
}

export function createDevBuyerClient(): Client {
	assertDev();
	return new Client({ handler: devPdsHandler });
}

export async function getDevBuyerDidDocument() {
	assertDev();
	const publicKeyMultibase = await (await signingKey()).exportPublicKey('multikey');
	return {
		'@context': ['https://www.w3.org/ns/did/v1'],
		id: DEV_BUYER_DID,
		alsoKnownAs: [`at://${DEV_BUYER_PROFILE.handle}`],
		verificationMethod: [
			{
				id: `${DEV_BUYER_DID}#atproto`,
				type: 'Multikey',
				controller: DEV_BUYER_DID,
				publicKeyMultibase
			}
		]
	};
}

/** Local RSVP overlay so the mock PDS survives page navigations in this dev process. */
export function getDevBuyerRsvp(eventUri: string): DevRecord | null {
	if (!dev) return null;
	for (const record of state().records.values()) {
		if (record.collection !== 'community.lexicon.calendar.rsvp') continue;
		const subject = record.value.subject as { uri?: unknown } | undefined;
		if (subject?.uri === eventUri) return record;
	}
	return null;
}
