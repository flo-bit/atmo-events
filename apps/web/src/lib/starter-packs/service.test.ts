import { Client } from '@atcute/client';
import { safeParse, type Did } from '@atcute/lexicons';
import { mainSchema as packSchema } from '@atcute/bluesky/types/app/graph/starterpack';
import { mainSchema as listSchema } from '@atcute/bluesky/types/app/graph/list';
import { mainSchema as itemSchema } from '@atcute/bluesky/types/app/graph/listitem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as TID from '@atcute/tid';
import {
	StarterPackService,
	MAPPING_COLLECTION,
	PACK_COLLECTION,
	LIST_COLLECTION,
	ITEM_COLLECTION,
	eventKey,
	parseEventUri,
	selectMembers,
	type PackSource
} from './service';

const bot = 'did:plc:bot' as Did;
const host = 'did:plc:host' as Did;
const alice = 'did:plc:alice' as Did;
const bob = 'did:plc:bob' as Did;
const speaker = 'did:plc:speaker' as Did;
const eventUri = `at://${host}/community.lexicon.calendar.event/${TID.now()}`;
type RecordEntry = { uri: string; cid: string; value: Record<string, unknown> };

/** In-memory PDS: real HTTP client, atomic batches and commit CAS, no network writes. */
class MemoryPds {
	records = new Map<string, RecordEntry>();
	revision = 0;
	batches: Array<
		Array<{ $type: string; collection: string; rkey: string; value?: Record<string, unknown> }>
	> = [];
	conflicts = 0;
	failCollection: string | null = null;
	failAfterBatch = 0;
	pageSize = 100;
	client = new Client({
		handler: async (path, init) => {
			const url = new URL(path, 'https://pds.test');
			const method = url.pathname.split('/').pop();
			const json = (value: unknown, status = 200) => Response.json(value, { status });
			const collection = url.searchParams.get('collection')!;
			if (this.failCollection && this.failCollection === collection)
				return json({ error: 'InternalServerError' }, 503);
			if (method === 'com.atproto.sync.getLatestCommit')
				return json({ cid: `commit${this.revision}`, rev: 'rev' });
			if (method === 'com.atproto.repo.getRecord') {
				return this.records.has(`${collection}/${url.searchParams.get('rkey')}`)
					? json(this.records.get(`${collection}/${url.searchParams.get('rkey')}`))
					: json({ error: 'RecordNotFound' }, 400);
			}
			if (method === 'com.atproto.repo.listRecords') {
				const offset = Number(url.searchParams.get('cursor') ?? 0);
				const all = [...this.records]
					.filter(([key]) => key.startsWith(collection + '/'))
					.map(([, value]) => value);
				const end = offset + this.pageSize;
				return json({
					records: all.slice(offset, end),
					...(end < all.length ? { cursor: String(end) } : {})
				});
			}
			const input = JSON.parse(init?.body as string);
			if (method === 'com.atproto.repo.applyWrites') {
				if (this.conflicts > 0) {
					this.conflicts--;
					this.revision++;
				}
				if (input.swapCommit !== `commit${this.revision}`)
					return json({ error: 'InvalidSwap' }, 400);
				expect(input.writes.length).toBeLessThanOrEqual(200);
				const next = new Map(this.records);
				for (const write of input.writes) {
					const key = `${write.collection}/${write.rkey}`;
					if (write.$type.endsWith('#delete')) next.delete(key);
					else {
						if (write.$type.endsWith('#create') && next.has(key))
							return json({ error: 'RecordAlreadyExists' }, 400);
						next.set(key, {
							uri: `at://${bot}/${key}`,
							cid: `record${this.revision + 1}`,
							value: write.value
						});
					}
				}
				this.records = next;
				this.revision++;
				this.batches.push(input.writes);
				if (this.failAfterBatch === this.batches.length)
					throw new Error('Connection lost after commit');
				return json({ commit: { cid: `commit${this.revision}`, rev: 'rev' }, results: [] });
			}
			if (method === 'com.atproto.repo.putRecord') {
				const key = `${input.collection}/${input.rkey}`;
				if (this.records.get(key)?.cid !== input.swapRecord)
					return json({ error: 'InvalidSwap' }, 400);
				this.revision++;
				this.records.set(key, {
					uri: `at://${bot}/${key}`,
					cid: `record${this.revision}`,
					value: input.record
				});
				return json({ uri: `at://${bot}/${key}`, cid: `record${this.revision}` });
			}
			throw new Error(`Unexpected RPC ${method}`);
		}
	});

	collection(name: string) {
		return [...this.records]
			.filter(([key]) => key.startsWith(name + '/'))
			.map(([, value]) => value);
	}
	members() {
		return this.collection(ITEM_COLLECTION).map((item) => item.value.subject as string);
	}
}

let pds: MemoryPds;
let source: PackSource;
let load: ReturnType<typeof vi.fn<(uri: string, signal: AbortSignal) => Promise<PackSource>>>;
let service: StarterPackService;
beforeEach(() => {
	pds = new MemoryPds();
	source = {
		uri: eventUri,
		host,
		name: 'Atmo meetup',
		mentions: [speaker],
		attendees: [alice, bob]
	};
	load = vi.fn(async () => structuredClone(source));
	service = new StarterPackService(pds.client, bot, load);
});

afterEach(() => vi.useRealTimers());

describe('bot-owned starter packs', () => {
	it('creates a reference list, ordinary TID pack/items and a deterministic mapping', async () => {
		const url = await service.getOrCreate(eventUri);
		expect(url).toMatch(/^https:\/\/bsky.app\/starter-pack\/did:plc:bot\//);
		expect(pds.members()).toEqual([host, speaker, alice, bob]);
		expect(pds.collection(LIST_COLLECTION)[0].value.purpose).toBe(
			'app.bsky.graph.defs#referencelist'
		);
		const [mapping] = pds.collection(MAPPING_COLLECTION);
		expect(mapping.uri).toBe(`at://${bot}/${MAPPING_COLLECTION}/${await eventKey(eventUri)}`);
		expect(mapping.value).toMatchObject({ event: eventUri, lastSyncedAt: expect.any(String) });
		for (const record of [
			...pds.collection(PACK_COLLECTION),
			...pds.collection(LIST_COLLECTION),
			...pds.collection(ITEM_COLLECTION)
		]) {
			expect(TID.validate(record.uri.split('/').pop()!)).toBe(true);
		}
		expect(await service.mappings()).toHaveLength(1);
	});
	it('returns the same pack without writing again, including from a fresh service instance', async () => {
		const url = await service.getOrCreate(eventUri);
		const writes = pds.batches.length;
		const fresh = new StarterPackService(pds.client, bot, load);
		load.mockRejectedValue(new Error('RSVP index is temporarily unavailable'));
		expect(await fresh.getOrCreate(eventUri)).toBe(url);
		expect(pds.batches).toHaveLength(writes);
	});
	it('converges concurrent clicks on a single pack/list/mapping with unique membership', async () => {
		const second = new StarterPackService(pds.client, bot, load);
		const urls = await Promise.all([service.getOrCreate(eventUri), second.getOrCreate(eventUri)]);
		expect(urls[0]).toBe(urls[1]);
		for (const collection of [MAPPING_COLLECTION, PACK_COLLECTION, LIST_COLLECTION])
			expect(pds.collection(collection)).toHaveLength(1);
		expect(new Set(pds.members()).size).toBe(pds.members().length);
	});
	it('retries repo conflicts caused by unrelated bot writes', async () => {
		pds.conflicts = 2;
		await service.getOrCreate(eventUri);
		expect(pds.collection(PACK_COLLECTION)).toHaveLength(1);
	});
	it('recovers after a lost creation response without publishing another pack', async () => {
		pds.failAfterBatch = 1;
		await expect(service.getOrCreate(eventUri)).rejects.toThrow('Connection lost');
		pds.failAfterBatch = 0;
		await service.getOrCreate(eventUri);
		await service.reconcile(eventUri);
		expect(pds.collection(PACK_COLLECTION)).toHaveLength(1);
		expect(new Set(pds.members())).toEqual(new Set([host, speaker, alice, bob]));
	});
	it('adds/removes members, deduplicates roles, updates names, and preserves createdAt', async () => {
		await service.getOrCreate(eventUri);
		const before = pds.collection(PACK_COLLECTION)[0].value.createdAt;
		source = {
			...source,
			name: 'Renamed event',
			mentions: [alice, host],
			attendees: [alice, 'did:plc:new']
		};
		await service.reconcile(eventUri);
		expect(new Set(pds.members())).toEqual(new Set([host, alice, 'did:plc:new']));
		expect(pds.collection(PACK_COLLECTION)[0].value).toMatchObject({
			name: 'Renamed event',
			createdAt: before
		});
		expect(pds.collection(LIST_COLLECTION)[0].value.name).toBe('Renamed event');
	});
	it('does not delete or recreate an eligible listitem (Bluesky opt-outs remain effective)', async () => {
		await service.getOrCreate(eventUri);
		const before = pds.collection(ITEM_COLLECTION);
		await service.reconcile(eventUri);
		expect(pds.collection(ITEM_COLLECTION)).toEqual(before);
		expect(pds.batches.at(-1)).toHaveLength(1); // registry timestamp only
	});
	it('keeps other events’ membership untouched', async () => {
		await service.getOrCreate(eventUri);
		const secondUri = `at://${host}/community.lexicon.calendar.event/${TID.now()}`;
		source = { ...source, uri: secondUri, attendees: ['did:plc:other'] };
		await service.getOrCreate(secondUri);
		const otherList = pds
			.collection(MAPPING_COLLECTION)
			.find((record) => record.value.event === secondUri)!.value.list;
		const otherItems = pds
			.collection(ITEM_COLLECTION)
			.filter((record) => record.value.list === otherList);
		source = { ...source, uri: eventUri, attendees: [] };
		await service.reconcile(eventUri);
		expect(
			pds.collection(ITEM_COLLECTION).filter((record) => record.value.list === otherList)
		).toEqual(otherItems);
	});
	it('caps at 500, paginates repository reads, stays stable, then fills a vacancy', async () => {
		source.attendees = Array.from({ length: 600 }, (_, n) => `did:plc:person${n}` as Did);
		await service.getOrCreate(eventUri);
		expect(pds.members()).toHaveLength(500);
		const before = new Set(pds.members());
		source.attendees.reverse();
		await service.reconcile(eventUri);
		expect(new Set(pds.members())).toEqual(before);
		const removed = [...before].find((did) => did !== host && did !== speaker)!;
		source.attendees = source.attendees.filter((did) => did !== removed);
		await service.reconcile(eventUri);
		expect(pds.members()).toHaveLength(500);
		expect(pds.members()).not.toContain(removed);
	});
	it('shares the pack time budget across batches and resumes partial work on a later run', async () => {
		await service.getOrCreate(eventUri);
		source.attendees = Array.from({ length: 600 }, (_, n) => `did:plc:person${n}` as Did);
		vi.useFakeTimers();
		load.mockImplementation(async (_uri, signal) => {
			await new Promise<void>((resolve, reject) => {
				const abort = () => {
					clearTimeout(timer);
					reject(signal.reason);
				};
				const timer = setTimeout(() => {
					signal.removeEventListener('abort', abort);
					resolve();
				}, 8_000);
				signal.addEventListener('abort', abort, { once: true });
			});
			return structuredClone(source);
		});
		const initialCalls = load.mock.calls.length;
		const failed = expect(service.reconcile(eventUri)).rejects.toThrow('time budget');
		await vi.waitUntil(() => load.mock.calls.length > initialCalls);
		// Crypto hashing/repository reads yield to the real event loop between batches.
		await vi.advanceTimersByTimeAsync(8_000);
		await vi.waitUntil(() => load.mock.calls.length >= initialCalls + 2);
		await vi.advanceTimersByTimeAsync(8_000);
		await vi.waitUntil(() => load.mock.calls.length >= initialCalls + 3);
		await vi.advanceTimersByTimeAsync(4_000);
		await failed;
		const written = pds.batches.length;
		expect(pds.members().length).toBeLessThan(500);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(pds.batches).toHaveLength(written); // No detached work after cancellation.
		load.mockImplementation(async () => structuredClone(source));
		await service.reconcile(eventUri);
		expect(pds.members()).toHaveLength(500);
		expect(new Set(pds.members()).size).toBe(500);
	});
	it('does not write at all when the parent run budget has already expired', async () => {
		await service.getOrCreate(eventUri);
		const written = pds.batches.length;
		await expect(
			service.reconcile(eventUri, AbortSignal.abort(new Error('expired')))
		).rejects.toThrow('expired');
		expect(pds.batches).toHaveLength(written);
	});
	it('never removes members when the source or repository pagination fails', async () => {
		await service.getOrCreate(eventUri);
		const before = pds.members();
		const writes = pds.batches.length;
		load.mockRejectedValueOnce(new Error('second RSVP page failed'));
		await expect(service.reconcile(eventUri)).rejects.toThrow('second RSVP page failed');
		pds.failCollection = ITEM_COLLECTION;
		await expect(service.reconcile(eventUri)).rejects.toThrow('Could not list');
		expect(pds.members()).toEqual(before);
		expect(pds.batches).toHaveLength(writes);
	});
	it('never treats a failed mapping read as absence', async () => {
		pds.failCollection = MAPPING_COLLECTION;
		await expect(service.getOrCreate(eventUri)).rejects.toThrow('Could not read');
		expect(pds.collection(PACK_COLLECTION)).toHaveLength(0);
	});
	it('saves failure backoff in atproto without advancing the successful-sync timestamp', async () => {
		await service.getOrCreate(eventUri);
		const previous = pds.collection(MAPPING_COLLECTION)[0].value.lastSyncedAt;
		await service.defer(eventUri);
		expect(pds.collection(MAPPING_COLLECTION)[0].value).toMatchObject({
			lastSyncedAt: previous,
			lastAttemptAt: expect.any(String)
		});
	});
	it('publishes records that validate against Bluesky schemas, with a real link facet', async () => {
		await service.getOrCreate(eventUri);
		for (const [collection, schema] of [
			[PACK_COLLECTION, packSchema],
			[LIST_COLLECTION, listSchema],
			[ITEM_COLLECTION, itemSchema]
		] as const) {
			for (const record of pds.collection(collection))
				expect(safeParse(schema, record.value).ok).toBe(true);
		}
		const pack = pds.collection(PACK_COLLECTION)[0].value;
		const facet = (
			pack.descriptionFacets as Array<{
				index: { byteStart: number; byteEnd: number };
				features: Array<{ uri: string }>;
			}>
		)[0];
		const bytes = new TextEncoder().encode(pack.description as string);
		expect(new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd))).toBe(
			facet.features[0].uri
		);
	});
	it('handles a single oversized grapheme and an event URL longer than the description limit', async () => {
		const longUri = `at://${host}/community.lexicon.calendar.event/${'a'.repeat(512)}`;
		source = { ...source, name: 'a' + '\u0301'.repeat(100), uri: longUri };
		await service.getOrCreate(longUri);
		const pack = pds.collection(PACK_COLLECTION)[0].value;
		expect(pack.name).toBe('Event attendees');
		expect(pack.descriptionFacets).toEqual([]);
		expect(safeParse(packSchema, pack).ok).toBe(true);
	});
	it('bounds names for both list and pack, including multibyte Unicode', async () => {
		source.name = '🎉'.repeat(100);
		await service.getOrCreate(eventUri);
		const name = pds.collection(PACK_COLLECTION)[0].value.name as string;
		expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(64);
		expect(name).toBe('🎉'.repeat(16));
	});
});

describe('membership and canonical identity', () => {
	it('rejects handles, alternate collections and malformed keys', () => {
		for (const uri of [
			'https://atmo.rsvp/event',
			'at://alice.test/community.lexicon.calendar.event/a',
			`at://${host}/app.bsky.feed.post/a`,
			`at://${host}/community.lexicon.calendar.event/..`
		]) {
			expect(() => parseEventUri(uri)).toThrow();
		}
	});
	it('hashes the full event URI, not just its potentially shared rkey', async () => {
		expect(await eventKey(eventUri)).toMatch(/^[a-f0-9]{64}$/);
		expect(await eventKey(eventUri)).not.toBe(await eventKey(eventUri.replace(host, alice)));
	});
	it('prioritizes host/mentions and deduplicates all roles', () => {
		expect(
			selectMembers({ ...source, mentions: [alice, host], attendees: [alice, bob, bob] }, [bob])
		).toEqual([host, alice, bob]);
	});
});
