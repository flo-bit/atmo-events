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
	/** The repos the space's authority tracks as writers: on its list, and written since. Every
	 *  page, or a throw. */
	writers(space: string): Promise<string[]>;
}

const LIST_REPOS = 'com.atproto.space.listRepos';
const LIST_REPOS_LIMIT = 100;
const MAX_WRITER_PAGES = 10;

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
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
	const ask = async (space: string, call: SpaceCall) => {
		let credential = credentials.get(space);
		if (!credential) {
			credential = hosts
				.repoHost(spaceAuthority(space))
				.then((authorityHost) => exchangeSpaceCredential(holder, space, authorityHost));
			credentials.set(space, credential);
		}
		return readXrpc(await fetchWithCredential(await credential, hosts, call));
	};

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
			const dids: string[] = [];
			let cursor: string | undefined;
			for (let page = 0; page < MAX_WRITER_PAGES; page++) {
				const answer = await ask(space, {
					host,
					audience: authority,
					nsid: LIST_REPOS,
					query: {
						space,
						limit: String(LIST_REPOS_LIMIT),
						...(cursor ? { cursor } : {})
					}
				});
				if (!answer.ok) throw answerError(LIST_REPOS, answer);
				const repos = Array.isArray(answer.data.repos) ? answer.data.repos : [];
				for (const repo of repos) {
					const did = (repo as { did?: unknown } | null)?.did;
					if (typeof did === 'string' && !dids.includes(did)) dids.push(did);
				}
				const next = typeof answer.data.cursor === 'string' ? answer.data.cursor : undefined;
				if (!next || repos.length === 0) return dids;
				cursor = next;
			}
			throw new Error(`${LIST_REPOS} went past ${MAX_WRITER_PAGES} pages`);
		}
	};
}
