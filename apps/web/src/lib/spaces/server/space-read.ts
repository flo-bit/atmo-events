// Reads records out of a space with the caller's own space credential, so the space's authority
// decides what each person sees.
import { spaceRecordUri, splitRecordUri } from '../uri';
import {
	credentialRequest,
	didSpaceHosts,
	spaceAuthority,
	type ExchangesUnderWay,
	type KeptCredentials,
	type SpaceHolder,
	type SpaceHosts
} from './space-credential';
import { answerError, answerIsRecordNotFound, type XrpcAnswer } from './xrpc';

export interface SpaceRecord {
	uri: string;
	cid: string;
	collection: string;
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
	/** Every page, or a throw: callers act on what is missing, so a partial list never returns. */
	list(query: { space: string; repo: string; collection?: string }): Promise<SpaceRecord[]>;
	/** The repos the space's authority tracks as writers: on its list, and written since. Every
	 *  page, or a throw. */
	writers(space: string): Promise<string[]>;
}

const LIST_RECORDS_LIMIT = 100;
const LIST_REPOS = 'com.atproto.space.listRepos';
const MAX_WRITER_PAGES = 10;

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

// `getRecord` returns `uri` without `collection` and `rkey`, and `listRecords` the reverse.
function toSpaceRecord(body: unknown, from: { space: string; repo: string }): SpaceRecord | null {
	if (!body || typeof body !== 'object') return null;
	const cid = 'cid' in body && typeof body.cid === 'string' ? body.cid : '';
	const value = asRecord('value' in body ? body.value : null);

	const listed = {
		collection: 'collection' in body && typeof body.collection === 'string' ? body.collection : '',
		rkey: 'rkey' in body && typeof body.rkey === 'string' ? body.rkey : ''
	};
	if (listed.collection && listed.rkey) {
		return {
			uri: spaceRecordUri(from.space, from.repo, listed.collection, listed.rkey),
			cid,
			collection: listed.collection,
			rkey: listed.rkey,
			value
		};
	}

	if (!('uri' in body) || typeof body.uri !== 'string') return null;
	const { collection, rkey } = splitRecordUri(body.uri);
	return { uri: body.uri, cid, collection, rkey, value };
}

type SpaceQuery = (nsid: string, params: Record<string, string>) => Promise<XrpcAnswer>;

function readerOver(query: SpaceQuery): Omit<SpaceReader, 'writers'> {
	const send = async (nsid: string, params: Record<string, string>) => {
		const answer = await query(nsid, params);
		// RecordNotFound is the only 400 that means absent. Anything else throws, so a gate
		// fails closed rather than read "no records".
		if (answerIsRecordNotFound(answer)) return null;
		if (!answer.ok) throw answerError(nsid, answer);
		return answer.data;
	};

	return {
		async get(query) {
			return toSpaceRecord(await send('com.atproto.space.getRecord', query), query);
		},
		async list(query) {
			const records: SpaceRecord[] = [];
			let cursor: string | undefined;
			for (;;) {
				const body = await send('com.atproto.space.listRecords', {
					space: query.space,
					repo: query.repo,
					...(query.collection ? { collection: query.collection } : {}),
					limit: String(LIST_RECORDS_LIMIT),
					...(cursor ? { cursor } : {})
				});
				const page = body && Array.isArray(body.records) ? body.records : null;
				if (!page) {
					if (cursor) throw new Error('com.atproto.space.listRecords returned no records page');
					return records;
				}
				for (const record of page) {
					const parsed = toSpaceRecord(record, query);
					if (parsed) records.push(parsed);
				}
				const next = typeof body?.cursor === 'string' ? body.cursor : undefined;
				if (!next || page.length === 0) return records;
				if (next === cursor) throw new Error('com.atproto.space.listRecords repeated its cursor');
				cursor = next;
			}
		}
	};
}

/** A space the holder may not read throws `SpaceAccessDenied`: no access, not an outage.
 *  `keepCredential: false` holds its credential only for this reader. Across requests a held one
 *  keeps reading for its remaining minutes after the authority takes someone off a list, which is
 *  too long where the list is the only thing that says who may read. */
export function credentialSpaceReader(
	holder: SpaceHolder,
	hosts: SpaceHosts = didSpaceHosts,
	options: { keepCredential?: boolean } = {}
): SpaceReader {
	// One reader per request, so its reads share exchanges only there.
	const underWay: ExchangesUnderWay = new Map();
	const store: KeptCredentials | undefined =
		options.keepCredential === false ? new Map() : undefined;
	return {
		...readerOver(async (nsid, params) => {
			const call = {
				host: await hosts.repoHost(params.repo),
				audience: params.repo,
				nsid,
				query: params
			};
			return credentialRequest(holder, hosts, params.space, call, underWay, store);
		}),
		async writers(space) {
			const authority = spaceAuthority(space);
			const host = await hosts.repoHost(authority);
			const dids: string[] = [];
			let cursor: string | undefined;
			for (let page = 0; page < MAX_WRITER_PAGES; page++) {
				const answer = await credentialRequest(
					holder,
					hosts,
					space,
					{
						host,
						audience: authority,
						nsid: LIST_REPOS,
						query: {
							space,
							limit: String(LIST_RECORDS_LIMIT),
							...(cursor ? { cursor } : {})
						}
					},
					underWay,
					store
				);
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
