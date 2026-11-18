// Reads records out of a space with the caller's own space credential, so the space's authority
// decides what each person sees.
import {
	didSpaceHosts,
	exchangeSpaceCredential,
	fetchWithCredential,
	GET_RECORD,
	spaceAuthority,
	type SpaceCall,
	type SpaceCredential,
	type SpaceHolder,
	type SpaceHosts
} from './space-credential';
import { answerError, answerIsRecordNotFound, readXrpc } from './xrpc';

export interface SpaceRecord {
	uri: string;
	cid: string;
	rkey: string;
	value: Record<string, unknown>;
}

export interface SpaceReader {
	get(query: {
		space: string;
		repo: string;
		collection: string;
		rkey: string;
	}): Promise<SpaceRecord | null>;
	/** The repos the space's authority tracks as writers: on its list, and written since. A repo
	 *  taken off the writer set is listed as removed, and left out here. Every page, or a throw. */
	writers(space: string): Promise<string[]>;
	/** A blob a record in the space cites, as bytes; null when the repo's host says it isn't there,
	 *  or it is longer than `limit` bytes. The bytes are what the host sent: nothing checks them
	 *  against the CID, and their type is the caller's to decide. */
	blob(
		query: { space: string; repo: string; cid: string },
		limit: number
	): Promise<Uint8Array<ArrayBuffer> | null>;
}

const LIST_WRITERS = 'com.atproto.space.listWriters';
const GET_BLOB = 'com.atproto.space.getBlob';
const LIST_WRITERS_LIMIT = 100;
// Each entry is a repo's latest state, in the order of the space's revisions; the other kind,
// `#repoRemoved`, is a repo taken off the writer set. A repo changed while the pages are read
// shows up again on a later page, so its last entry wins, and only a write counts.
const REPO_WRITE = 'com.atproto.space.defs#repoWrite';
const MAX_WRITER_PAGES = 10;

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** The body, or null past `limit` bytes, read no further than that. */
async function readUpTo(res: Response, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
	if (Number(res.headers.get('content-length')) > limit) {
		await res.body?.cancel();
		return null;
	}
	if (!res.body) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let length = 0;
	for await (const chunk of res.body) {
		length += chunk.byteLength;
		if (length > limit) {
			await res.body.cancel().catch(() => {});
			return null;
		}
		chunks.push(chunk);
	}
	const bytes = new Uint8Array(length);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return bytes;
}

/** A space the holder may not read throws `SpaceAccessDenied`: no access, not an outage.
 *  Make one for each request, since it holds its credentials. Across requests a held one keeps
 *  reading for its remaining minutes after the authority takes someone off a list, which is too long
 *  where the list is the only thing that says who may read. */
export function credentialSpaceReader(
	holder: SpaceHolder,
	hosts: SpaceHosts = didSpaceHosts
): SpaceReader {
	// By space, so reads that start together share one exchange and a refusal reaches them all.
	const credentials = new Map<string, Promise<SpaceCredential>>();
	const send = async (space: string, call: SpaceCall) => {
		let credential = credentials.get(space);
		if (!credential) {
			credential = hosts
				.repoHost(spaceAuthority(space))
				.then((authorityHost) => exchangeSpaceCredential(holder, space, authorityHost));
			credentials.set(space, credential);
		}
		return fetchWithCredential(await credential, hosts, call);
	};
	const ask = async (space: string, call: SpaceCall) => readXrpc(await send(space, call));

	return {
		async get(query) {
			const answer = await ask(query.space, {
				host: await hosts.repoHost(query.repo),
				audience: query.repo,
				nsid: GET_RECORD,
				query
			});
			// RecordNotFound is the only 400 that means absent. Anything else throws, so a gate
			// fails closed rather than read "no records".
			if (answerIsRecordNotFound(answer)) return null;
			if (!answer.ok) throw answerError(GET_RECORD, answer);
			// `getRecord` returns `uri` without `collection` and `rkey`. The URI, MAC and CID are checked.
			const { uri, cid, value } = answer.data;
			return { uri: String(uri), cid: String(cid), rkey: query.rkey, value: asRecord(value) };
		},
		async writers(space) {
			const authority = spaceAuthority(space);
			const host = await hosts.repoHost(authority);
			const dids = new Set<string>();
			let cursor: string | undefined;
			for (let page = 0; page < MAX_WRITER_PAGES; page++) {
				const answer = await ask(space, {
					host,
					audience: authority,
					nsid: LIST_WRITERS,
					query: {
						space,
						limit: String(LIST_WRITERS_LIMIT),
						...(cursor ? { cursor } : {})
					}
				});
				if (!answer.ok) throw answerError(LIST_WRITERS, answer);
				const repos = Array.isArray(answer.data.repos) ? answer.data.repos : [];
				for (const entry of repos) {
					const { $type, repo } = asRecord(entry);
					if (typeof repo !== 'string') continue;
					if ($type === REPO_WRITE) dids.add(repo);
					else dids.delete(repo);
				}
				const next = typeof answer.data.cursor === 'string' ? answer.data.cursor : undefined;
				if (!next || repos.length === 0) return [...dids];
				cursor = next;
			}
			throw new Error(`${LIST_WRITERS} went past ${MAX_WRITER_PAGES} pages`);
		},
		async blob(query, limit) {
			const res = await send(query.space, {
				host: await hosts.repoHost(query.repo),
				audience: query.repo,
				nsid: GET_BLOB,
				query
			});
			if (res.ok) return readUpTo(res, limit);
			const answer = await readXrpc(res);
			const error = answer.ok ? null : answer.error;
			// Only these say the blob isn't there. Anything else throws, so an outage never reads as
			// "no blob".
			if (res.status === 404 || (res.status === 400 && error === 'BlobNotFound')) return null;
			throw answerError(GET_BLOB, { status: res.status, error });
		}
	};
}
