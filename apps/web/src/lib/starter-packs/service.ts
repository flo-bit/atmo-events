import type { Client } from '@atcute/client';
import type { Cid, Did, Nsid } from '@atcute/lexicons';
import type { $input as ApplyWritesInput } from '@atcute/atproto/types/repo/applyWrites';
import { isDid } from '@atcute/lexicons/syntax';
import { safeParse } from '@atcute/lexicons';
import { mainSchema as mappingSchema } from '../../lexicon-types/types/rsvp/atmo/eventStarterPack';
import * as TID from '@atcute/tid';
import { withDeadline } from './deadline';

export const MAPPING_COLLECTION = 'rsvp.atmo.eventStarterPack';
export const PACK_COLLECTION = 'app.bsky.graph.starterpack';
export const LIST_COLLECTION = 'app.bsky.graph.list';
export const ITEM_COLLECTION = 'app.bsky.graph.listitem';
export const MAX_MEMBERS = 500;
const MAX_WRITES = 200;
const REQUEST_TIMEOUT_MS = 10_000;
const PACK_BUDGET_MS = 20_000;

function requestSignal(parent?: AbortSignal): AbortSignal {
	parent?.throwIfAborted();
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

export type PackSource = {
	uri: string;
	host: Did;
	name: string;
	mentions: Did[];
	attendees: Did[];
};
export type PackMapping = {
	$type: typeof MAPPING_COLLECTION;
	event: string;
	starterPack: string;
	list: string;
	createdAt: string;
	lastAttemptAt?: string;
	lastSyncedAt?: string;
};
type RepoRecord = { uri: string; cid: string; value: Record<string, unknown> };
type Write = ApplyWritesInput['writes'][number];

export function parseEventUri(uri: string): { did: Did; rkey: string } {
	const match =
		/^at:\/\/(did:[^/?#]+)\/community\.lexicon\.calendar\.event\/([a-zA-Z0-9._:~-]{1,512})$/.exec(
			uri
		);
	if (!match || !isDid(match[1]) || match[2] === '.' || match[2] === '..') {
		throw new Error('Expected a canonical DID-based event URI');
	}
	return { did: match[1], rkey: match[2] };
}

export async function eventKey(uri: string): Promise<string> {
	parseEventUri(uri);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uri));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function recordKey(uri: string): string {
	return uri.slice(uri.lastIndexOf('/') + 1);
}
export function packUrl(mapping: PackMapping): string {
	return `https://bsky.app/starter-pack/${mapping.starterPack.split('/')[2]}/${recordKey(mapping.starterPack)}`;
}

/** Host/mentions get priority; otherwise retain eligible members before filling vacancies. */
export function selectMembers(source: PackSource, existing: string[]): Did[] {
	const priority = [source.host, ...source.mentions].filter(isDid);
	const eligible = new Set([...priority, ...source.attendees.filter(isDid)]);
	return [
		...new Set([
			...priority,
			...existing.filter((did) => eligible.has(did as Did)),
			...source.attendees
		])
	]
		.filter(isDid)
		.slice(0, MAX_MEMBERS);
}

function truncate(text: string, graphemes: number, bytes: number): string {
	const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
	let result = '';
	let count = 0;
	for (const { segment } of segments) {
		if (++count > graphemes || new TextEncoder().encode(result + segment).length > bytes) break;
		result += segment;
	}
	return result;
}
function metadata(source: PackSource) {
	const name = truncate(source.name.trim(), 50, 64) || 'Event attendees';
	const { did, rkey } = parseEventUri(source.uri);
	const prefix = `People at ${name}\n`;
	const url = `https://atmo.rsvp/p/${encodeURIComponent(did)}/e/${encodeURIComponent(rkey)}`;
	const fullDescription = prefix + url;
	// Unusual did:web identifiers/record keys can exceed Bluesky's 300-grapheme
	// description limit. Never publish a truncated, misleading event link.
	if (truncate(fullDescription, 300, 3000) !== fullDescription) {
		return { name, description: prefix.trimEnd(), descriptionFacets: [] };
	}
	return {
		name,
		description: fullDescription,
		descriptionFacets: [
			{
				index: {
					byteStart: new TextEncoder().encode(prefix).length,
					byteEnd: new TextEncoder().encode(fullDescription).length
				},
				features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }]
			}
		]
	};
}

/** All registry and membership state is read from the bot's PDS, never an AppView cache. */
export class StarterPackService {
	constructor(
		private client: Client,
		private did: Did,
		private loadSource: (uri: string, signal: AbortSignal) => Promise<PackSource>
	) {}

	private uri(collection: string, rkey: string) {
		return `at://${this.did}/${collection}/${rkey}`;
	}
	private async commit(signal: AbortSignal) {
		const response = await this.client.get('com.atproto.sync.getLatestCommit', {
			params: { did: this.did },
			signal: requestSignal(signal)
		});
		if (!response.ok) throw new Error('Could not read bot repository commit');
		return response.data.cid;
	}
	private async get(
		collection: string,
		rkey: string,
		signal?: AbortSignal
	): Promise<RepoRecord | null> {
		const response = await this.client.get('com.atproto.repo.getRecord', {
			params: { repo: this.did, collection: collection as Nsid, rkey },
			signal: requestSignal(signal)
		});
		if (!response.ok) {
			if (response.data.error === 'RecordNotFound') return null;
			throw new Error(`Could not read ${collection}: ${response.data.error}`);
		}
		return response.data as RepoRecord;
	}
	private mapping(record: RepoRecord): PackMapping {
		const parsed = safeParse(mappingSchema, record.value);
		if (!parsed.ok) throw new Error('Invalid starter-pack mapping');
		const value = parsed.value;
		if (
			value.starterPack !== this.uri(PACK_COLLECTION, recordKey(value.starterPack)) ||
			value.list !== this.uri(LIST_COLLECTION, recordKey(value.list)) ||
			!TID.validate(recordKey(value.starterPack)) ||
			!TID.validate(recordKey(value.list))
		) {
			throw new Error('Invalid starter-pack mapping');
		}
		parseEventUri(value.event);
		return value;
	}
	async list(collection = MAPPING_COLLECTION, signal?: AbortSignal): Promise<RepoRecord[]> {
		const records: RepoRecord[] = [];
		let cursor: string | undefined;
		const seen = new Set<string>();
		do {
			const response = await this.client.get('com.atproto.repo.listRecords', {
				params: { repo: this.did, collection: collection as Nsid, limit: 100, cursor },
				signal: requestSignal(signal)
			});
			if (!response.ok) throw new Error(`Could not list ${collection}`);
			records.push(...(response.data.records as RepoRecord[]));
			cursor = response.data.cursor;
			if (cursor && (seen.has(cursor) || seen.size >= 1000))
				throw new Error('Incomplete repository pagination');
			if (cursor) seen.add(cursor);
		} while (cursor);
		return records;
	}
	async mappings(signal?: AbortSignal): Promise<PackMapping[]> {
		const records = await this.list(MAPPING_COLLECTION, signal);
		const mappings: PackMapping[] = [];
		for (const record of records) {
			signal?.throwIfAborted();
			try {
				const mapping = this.mapping(record);
				if (recordKey(record.uri) === (await eventKey(mapping.event))) mappings.push(mapping);
			} catch {
				console.warn('[starter-packs] ignoring invalid mapping', record.uri);
			}
		}
		return mappings;
	}
	private async write(
		commit: Awaited<ReturnType<StarterPackService['commit']>>,
		writes: Write[],
		signal: AbortSignal
	) {
		const response = await this.client.post('com.atproto.repo.applyWrites', {
			input: { repo: this.did, swapCommit: commit, writes },
			signal: requestSignal(signal)
		});
		if (!response.ok) {
			if (response.data.error === 'InvalidSwap') return false;
			throw new Error(`Starter-pack write failed: ${response.data.error}`);
		}
		return true;
	}

	async getOrCreate(uri: string): Promise<string> {
		return withDeadline(PACK_BUDGET_MS, undefined, (signal) =>
			this.createWithinBudget(uri, signal)
		);
	}
	private async createWithinBudget(uri: string, signal: AbortSignal): Promise<string> {
		const key = await eventKey(uri);
		for (let attempt = 0; attempt < 8; attempt++) {
			const commit = await this.commit(signal);
			const existing = await this.get(MAPPING_COLLECTION, key, signal);
			if (existing) {
				const mapping = this.mapping(existing);
				if (mapping.event !== uri)
					throw new Error('Starter-pack mapping points to a different event');
				return packUrl(mapping);
			}
			// Creation requires a real, visible event and a complete membership source.
			// Existing packs remain openable even if the RSVP index is temporarily down.
			const source = await this.loadSource(uri, signal);
			const now = new Date().toISOString();
			const mapping: PackMapping = {
				$type: MAPPING_COLLECTION,
				event: uri,
				createdAt: now,
				list: this.uri(LIST_COLLECTION, TID.now()),
				starterPack: this.uri(PACK_COLLECTION, TID.now())
			};
			const details = metadata(source);
			const members = selectMembers(source, []);
			const writes: Write[] = [
				{
					$type: 'com.atproto.repo.applyWrites#create',
					collection: LIST_COLLECTION,
					rkey: recordKey(mapping.list),
					value: {
						$type: LIST_COLLECTION,
						...details,
						purpose: 'app.bsky.graph.defs#referencelist',
						createdAt: now
					}
				},
				{
					$type: 'com.atproto.repo.applyWrites#create',
					collection: PACK_COLLECTION,
					rkey: recordKey(mapping.starterPack),
					value: {
						$type: PACK_COLLECTION,
						...details,
						list: mapping.list,
						createdAt: now
					}
				},
				{
					$type: 'com.atproto.repo.applyWrites#create',
					collection: MAPPING_COLLECTION,
					rkey: key,
					value: mapping
				},
				...members.slice(0, MAX_WRITES - 3).map((did) => this.addMember(mapping, did, now))
			];
			// Atomic publication of the registry, list, pack and first members. A concurrent
			// click or unrelated bot write invalidates this entire batch, not just one record.
			if (!(await this.write(commit, writes, signal))) continue;
			await this.reconcileWithinBudget(uri, signal);
			return packUrl(mapping);
		}
		throw new Error('Bot repository is busy; please try again');
	}
	private addMember(mapping: PackMapping, did: Did, now: string): Write {
		return {
			$type: 'com.atproto.repo.applyWrites#create',
			collection: ITEM_COLLECTION,
			rkey: TID.now(),
			value: {
				$type: ITEM_COLLECTION,
				subject: did,
				list: mapping.list,
				createdAt: now
			}
		};
	}

	async reconcile(uri: string, parent?: AbortSignal): Promise<void> {
		return withDeadline(PACK_BUDGET_MS, parent, (signal) =>
			this.reconcileWithinBudget(uri, signal)
		);
	}
	private async reconcileWithinBudget(uri: string, signal: AbortSignal): Promise<void> {
		const key = await eventKey(uri);
		for (let attempt = 0; attempt < 12; attempt++) {
			const commit = await this.commit(signal);
			// No writes at all unless every source page loaded successfully.
			const source = await this.loadSource(uri, signal);
			const record = await this.get(MAPPING_COLLECTION, key, signal);
			if (!record) return;
			const mapping = this.mapping(record);
			if (mapping.event !== uri)
				throw new Error('Starter-pack mapping points to a different event');
			const [allItems, list, pack] = await Promise.all([
				this.list(ITEM_COLLECTION, signal),
				this.get(LIST_COLLECTION, recordKey(mapping.list), signal),
				this.get(PACK_COLLECTION, recordKey(mapping.starterPack), signal)
			]);
			if (!list || !pack) throw new Error('Managed starter pack or list was deleted');
			const items = allItems
				.filter((item) => item.value.list === mapping.list)
				.sort((a, b) => a.uri.localeCompare(b.uri));
			const desired = new Set(
				selectMembers(
					source,
					items.map((item) => item.value.subject as string)
				)
			);
			const retained = new Set<Did>();
			const changes: Write[] = [];
			for (const item of items) {
				const did = item.value.subject as Did;
				if (!desired.has(did) || retained.has(did)) {
					changes.push({
						$type: 'com.atproto.repo.applyWrites#delete',
						collection: ITEM_COLLECTION,
						rkey: recordKey(item.uri)
					});
				} else retained.add(did);
			}
			const now = new Date().toISOString();
			// We do not touch anyone's referencelistoptout records. Existing eligible
			// listitems stay put, including people the Bluesky AppView hides after opt-out.
			for (const did of desired)
				if (!retained.has(did)) changes.push(this.addMember(mapping, did, now));
			const details = metadata(source);
			for (const [collection, current] of [
				[LIST_COLLECTION, list],
				[PACK_COLLECTION, pack]
			] as const) {
				if (
					current.value.name !== details.name ||
					current.value.description !== details.description ||
					JSON.stringify(current.value.descriptionFacets) !==
						JSON.stringify(details.descriptionFacets)
				) {
					changes.push({
						$type: 'com.atproto.repo.applyWrites#update',
						collection,
						rkey: recordKey(current.uri),
						value: { ...current.value, ...details }
					});
				}
			}
			changes.push({
				$type: 'com.atproto.repo.applyWrites#update',
				collection: MAPPING_COLLECTION,
				rkey: key,
				value: { ...mapping, lastAttemptAt: now, lastSyncedAt: now }
			});
			if (!(await this.write(commit, changes.slice(0, MAX_WRITES), signal))) continue;
			if (changes.length <= MAX_WRITES) return;
			// Large changes span bounded batches. Re-read under a fresh commit between
			// them; crashes and racing workers are repaired without duplicate listitems.
		}
		throw new Error('Starter-pack reconciliation needs another attempt');
	}

	/** Persist failure backoff in atproto too, so a bad event cannot starve later packs. */
	async defer(uri: string): Promise<void> {
		const key = await eventKey(uri);
		const record = await this.get(MAPPING_COLLECTION, key);
		if (!record) return;
		const response = await this.client.post('com.atproto.repo.putRecord', {
			input: {
				repo: this.did,
				collection: MAPPING_COLLECTION,
				rkey: key,
				swapRecord: record.cid as Cid,
				record: { ...this.mapping(record), lastAttemptAt: new Date().toISOString() }
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (!response.ok && response.data.error !== 'InvalidSwap')
			throw new Error('Could not defer pack refresh');
	}
}
