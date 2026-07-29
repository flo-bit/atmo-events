import { afterEach, describe, expect, it, vi } from 'vitest';

// runLoadMoreEvents now decodes a self-describing continuation ENVELOPE and
// dispatches through a backend->resumer REGISTRY keyed by the envelope's query
// name — no routeMeili/if-else, no pipeline switch, no client-echoed
// query-reconstruction bag. These tests pin: (1) each query routes to the right
// server-side pipeline with SERVER-AUTHORITATIVE filters, (2) security — a
// tampered/forged envelope can never reach the unlisted-inclusive plain
// listRecords pipeline (it has no registry entry), (3) continuity — the next
// cursor re-encodes the SAME query so page N+1 stays adjacent and
// non-overlapping, (4) legacy/undecodable cursors end pagination cleanly
// without reconstruction.
vi.mock('./index', () => ({
	getServerClient: vi.fn(() => ({}))
}));
vi.mock('$lib/contrail', () => ({
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	// Exported so the no-leak assertion can prove it is NEVER called — it has no
	// registry entry, so no decoded envelope can reach it.
	listEventRecordsFromContrail: vi.fn(),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn(),
	runOngoingSearchPage: vi.fn()
}));

import * as v from 'valibot';
import { listEventsInput, runLoadMoreEvents } from './events-load-more';
import { encodeCursor, decodeCursor, type CursorEnvelope } from './cursor';
import {
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import {
	runEventSearchPage,
	runOngoingSearchPage,
	searchBackendFromEnv
} from '$lib/search/server/query';
import { SEARCH_PAGE_SIZE } from '$lib/search/constants';

const mockRecords = vi.mocked(listEventRecordsFromContrail);
const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);
const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);
const mockSearchBackend = vi.mocked(searchBackendFromEnv);
const mockRunSearch = vi.mocked(runEventSearchPage);
const mockRunOngoingSearch = vi.mocked(runOngoingSearchPage);

const env = { DB: {} } as unknown as App.Platform['env'];

const call = (cursor: string | undefined, q?: string) => runLoadMoreEvents(env, { cursor, q });

// A valid envelope token (as the server would emit it).
const token = (envelope: CursorEnvelope) => encodeCursor(envelope);

// A forged token with ARBITRARY content, bypassing encodeCursor's type gate.
const forge = (obj: unknown) => Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');

const page = (records: unknown[], cursor: string | null = 'next', profiles: unknown[] = []) =>
	({ records, profiles, cursor }) as unknown as Awaited<
		ReturnType<typeof listDiscoverableEventsFromContrail>
	>;

const noReads = () => {
	expect(mockDiscoverable).not.toHaveBeenCalled();
	expect(mockAuthored).not.toHaveBeenCalled();
	expect(mockRecords).not.toHaveBeenCalled();
	expect(mockRunSearch).not.toHaveBeenCalled();
};

afterEach(() => vi.clearAllMocks());

describe('runLoadMoreEvents registry dispatch', () => {
	it("routes 'events' to listDiscoverable with server-authoritative upcoming filters", async () => {
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://x' }], 'raw2'));

		const result = await call(token({ v: 1, q: 'events', args: { popular: true }, raw: 'raw1' }));

		expect(mockDiscoverable).toHaveBeenCalledTimes(1);
		expect(mockAuthored).not.toHaveBeenCalled();
		expect(mockRecords).not.toHaveBeenCalled();
		const params = mockDiscoverable.mock.calls[0][1];
		// Same literals the events/+page.server.ts page-1 load uses (continuity).
		expect(params).toMatchObject({
			sort: 'startsAt',
			order: 'asc',
			limit: 20,
			profiles: true,
			rsvpsCountMin: 2,
			cursor: 'raw1'
		});
		expect(typeof params.startsAtMin).toBe('string');
		// Next cursor re-encodes the SAME query + args with the fresh keyset.
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'events',
			args: { popular: true },
			raw: 'raw2'
		});
	});

	it("drops rsvpsCountMin for a non-popular 'events' envelope", async () => {
		mockDiscoverable.mockResolvedValue(page([], null));
		await call(token({ v: 1, q: 'events', args: { popular: false }, raw: 'r' }));
		expect(mockDiscoverable.mock.calls[0][1]).not.toHaveProperty('rsvpsCountMin');
	});

	it("routes 'happening-now' to listDiscoverable with BOTH band bounds, endsAt asc", async () => {
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://x' }], 'raw2'));

		const result = await call(token({ v: 1, q: 'happening-now', raw: 'raw1' }));

		expect(mockDiscoverable).toHaveBeenCalledTimes(1);
		const params = mockDiscoverable.mock.calls[0][1];
		// Same literals the events/now page-1 load uses (continuity).
		expect(params).toMatchObject({ sort: 'endsAt', order: 'asc', limit: 20, cursor: 'raw1' });
		expect(params.startsAtMax).toBe(params.endsAtMin);
		// The upcoming bound must NOT appear — it excludes the entire list.
		expect(params.startsAtMin).toBeUndefined();
		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'happening-now', raw: 'raw2' });
	});

	it("routes 'hosting' to listAuthored scoped to the actor, upcoming asc", async () => {
		mockAuthored.mockResolvedValue(page([{ uri: 'at://h' }], 'raw2'));

		const result = await call(
			token({ v: 1, q: 'hosting', args: { actor: 'did:plc:alice' }, raw: 'raw1' })
		);

		expect(mockAuthored).toHaveBeenCalledTimes(1);
		expect(mockDiscoverable).not.toHaveBeenCalled();
		const params = mockAuthored.mock.calls[0][1];
		expect(params).toMatchObject({
			actor: 'did:plc:alice',
			sort: 'startsAt',
			order: 'asc',
			profiles: true,
			limit: 20,
			cursor: 'raw1'
		});
		expect(typeof params.startsAtMin).toBe('string');
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'hosting',
			args: { actor: 'did:plc:alice' },
			raw: 'raw2'
		});
	});

	it("routes 'past-events' to listAuthored scoped to the actor, past desc", async () => {
		mockAuthored.mockResolvedValue(page([{ uri: 'at://p' }], 'raw2'));

		const result = await call(
			token({ v: 1, q: 'past-events', args: { actor: 'did:plc:alice' }, raw: 'raw1' })
		);

		const params = mockAuthored.mock.calls[0][1];
		expect(params).toMatchObject({
			actor: 'did:plc:alice',
			sort: 'startsAt',
			order: 'desc',
			limit: 20,
			cursor: 'raw1'
		});
		expect(typeof params.startsAtMax).toBe('string');
		expect(decodeCursor(result.cursor)).toMatchObject({ q: 'past-events' });
	});

	it("routes 'topic' to listDiscoverable, deriving the search from the slug server-side", async () => {
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://t' }], 'raw2'));

		const result = await call(
			token({ v: 1, q: 'topic', args: { slug: 'technology' }, raw: 'raw1' })
		);

		const params = mockDiscoverable.mock.calls[0][1];
		// orQueryFromSlug('technology') — the SAME helper the topic page load uses.
		expect(params.search).toBe('tech OR technology');
		expect(params).toMatchObject({ order: 'asc', limit: 20, cursor: 'raw1' });
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'topic',
			args: { slug: 'technology' },
			raw: 'raw2'
		});
	});

	it("routes 'search-d1' to listDiscoverable with the term from input, upcoming desc", async () => {
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://s' }], 'raw2'));

		const result = await call(token({ v: 1, q: 'search-d1', raw: 'raw1' }), 'jazz');

		const params = mockDiscoverable.mock.calls[0][1];
		expect(params).toMatchObject({
			search: 'jazz',
			order: 'desc',
			limit: SEARCH_PAGE_SIZE,
			cursor: 'raw1'
		});
		expect(typeof params.startsAtMin).toBe('string');
		expect(decodeCursor(result.cursor)).toMatchObject({ q: 'search-d1', raw: 'raw2' });
	});

	it("routes 'search-meili' to runEventSearchPage with the term + raw offset, re-wraps next", async () => {
		mockSearchBackend.mockReturnValue({ url: 'https://m', apiKey: 'k' });
		mockRunSearch.mockResolvedValue({
			events: [{ uri: 'at://s' }],
			handles: { 'did:plc:a': 'alice' },
			cursor: 'meili:40',
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>);

		const result = await call(token({ v: 1, q: 'search-meili', raw: 'meili:20' }), 'jazz');

		expect(mockRunSearch).toHaveBeenCalledTimes(1);
		expect(mockRunSearch.mock.calls[0][2]).toMatchObject({ q: 'jazz', cursor: 'meili:20' });
		expect(decodeCursor(result.cursor)).toEqual({ v: 1, q: 'search-meili', raw: 'meili:40' });
	});

	it('ends pagination when the contrail read returns null', async () => {
		mockDiscoverable.mockResolvedValue(null);
		const result = await call(token({ v: 1, q: 'events', args: { popular: true }, raw: 'k' }));
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('ends pagination (null cursor) when the backend has no next page', async () => {
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://x' }], null));
		const result = await call(token({ v: 1, q: 'events', args: { popular: true }, raw: 'k' }));
		expect(result.cursor).toBeNull();
	});
});

// Security invariant: a client-held, mutable cursor must not let a tampered
// continuation widen visibility. It holds BY CONSTRUCTION — the unlisted-
// inclusive listRecords pipeline has NO registry entry, and the envelope carries
// no filter values to tamper.
describe('security: a tampered/forged envelope cannot surface non-discoverable events', () => {
	const unlisted = { uri: 'at://did:plc:secret/community.lexicon.calendar.event/hidden' };

	it("q tampered to 'plain' resumes nothing and never reaches plain listRecords", async () => {
		// listRecords WOULD return the hidden event if it were reachable; prove it
		// is never called and the hidden event never surfaces.
		mockRecords.mockResolvedValue(page([unlisted]));
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://ok' }]));

		const result = await call(forge({ v: 1, q: 'plain', raw: 'anything' }));

		expect(result).toEqual({ events: [], handles: {}, cursor: null });
		expect(result.events).not.toContainEqual(unlisted);
		noReads();
	});

	it('q tampered to an unknown string / prototype key / missing / empty => empty, and listRecords never runs', async () => {
		mockRecords.mockResolvedValue(page([unlisted]));
		for (const forged of [
			forge({ v: 1, q: 'listRecords', raw: 'x' }),
			// A prototype-chain name must never dispatch (decodeCursor rejects it first,
			// and the Object.hasOwn dispatch guard is belt-and-suspenders behind that).
			forge({ v: 1, q: 'constructor', raw: 'x' }),
			forge({ v: 1, q: '__proto__', raw: 'x' }),
			forge({ v: 1, raw: 'x' }),
			forge({ v: 1, q: '', raw: 'x' })
		]) {
			expect(await call(forged)).toEqual({ events: [], handles: {}, cursor: null });
		}
		expect(mockRecords).not.toHaveBeenCalled();
	});

	it('a valid discoverable envelope routes ONLY to listDiscoverable, never to listRecords', async () => {
		mockRecords.mockResolvedValue(page([unlisted]));
		mockDiscoverable.mockResolvedValue(page([{ uri: 'at://discoverable' }], null));

		const result = await call(token({ v: 1, q: 'events', args: { popular: true }, raw: 'k' }));

		expect(mockDiscoverable).toHaveBeenCalledTimes(1);
		expect(mockRecords).not.toHaveBeenCalled();
		expect(result.events).not.toContainEqual(unlisted);
	});

	it('dropping all args cannot surface a non-discoverable event (startsAtMin is server-applied)', async () => {
		mockRecords.mockResolvedValue(page([unlisted]));
		mockDiscoverable.mockResolvedValue(page([], null));

		await call(token({ v: 1, q: 'events', raw: 'k' })); // args stripped entirely

		expect(mockRecords).not.toHaveBeenCalled();
		// The discoverability filter + startsAtMin live in the D1 pipeline, not the
		// client cursor: listDiscoverable still ran with a server-supplied bound.
		expect(typeof mockDiscoverable.mock.calls[0][1].startsAtMin).toBe('string');
	});

	it('switching q among public-safe queries re-scopes but never leaks or throws', async () => {
		mockAuthored.mockResolvedValue(page([{ uri: 'at://authored' }], null));
		// A different actor on 'hosting' is exactly the same as browsing that public
		// profile — permitted, and it still scopes to that actor.
		const result = await call(
			token({ v: 1, q: 'hosting', args: { actor: 'did:plc:bob' }, raw: 'k' })
		);
		expect(mockAuthored).toHaveBeenCalledTimes(1);
		expect(mockAuthored.mock.calls[0][1]).toMatchObject({ actor: 'did:plc:bob' });
		expect(result.cursor).toBeNull();
	});
});

describe('registry required-arg guards end cleanly (never throw, never fall through)', () => {
	it('hosting with a missing actor => empty', async () => {
		const result = await call(token({ v: 1, q: 'hosting', raw: 'k' }));
		expect(mockAuthored).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('hosting with a malformed actor => empty', async () => {
		const result = await call(
			token({ v: 1, q: 'hosting', args: { actor: 'not an actor!!' }, raw: 'k' })
		);
		expect(mockAuthored).not.toHaveBeenCalled();
		expect(result.cursor).toBeNull();
	});

	it('topic with an unknown slug => empty', async () => {
		const result = await call(
			token({ v: 1, q: 'topic', args: { slug: 'no-such-topic' }, raw: 'k' })
		);
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('search-d1 with the search term lost => empty', async () => {
		const result = await call(token({ v: 1, q: 'search-d1', raw: 'k' }));
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('search-meili with no configured backend => empty', async () => {
		mockSearchBackend.mockReturnValue(null);
		const result = await call(token({ v: 1, q: 'search-meili', raw: 'meili:20' }), 'jazz');
		expect(mockRunSearch).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('search-meili with the search term lost => empty', async () => {
		mockSearchBackend.mockReturnValue({ url: 'https://m', apiKey: 'k' });
		const result = await call(token({ v: 1, q: 'search-meili', raw: 'meili:20' }));
		expect(mockRunSearch).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});
});

// Legacy meili:/d1: tags and bare offsets are in-flight during the deploy
// window. They (and any tampered token) must end pagination cleanly, WITHOUT
// reconstructing a query from client fields (that would re-open the insecure
// path).
describe('legacy / undecodable cursors end pagination cleanly with no read', () => {
	it.each([
		['a meili tag', 'meili:20'],
		['a d1 tag', 'd1:eyJ0IjoxNzUsImsiOiJhdDovL3gifQ'],
		['a bare legacy offset', '20'],
		['a bare legacy keyset', 'eyJ0IjoxNzUsImsiOiJhdDovL3gifQ'],
		['a garbage token', 'not a real token'],
		['an empty string', '']
	])('%s => empty, no query run', async (_label, cursor) => {
		mockSearchBackend.mockReturnValue({ url: 'https://m', apiKey: 'k' });
		const result = await call(cursor, 'jazz');
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
		noReads();
	});

	it('an absent cursor => empty', async () => {
		expect(await call(undefined)).toEqual({ events: [], handles: {}, cursor: null });
		noReads();
	});

	it('does NOT reconstruct a query from a legacy tag even with a search term present', async () => {
		// Deploy-straddle: old client POSTs a legacy tag + (dropped) stale query
		// params + a search term. The tag fails to decode => empty, no re-inference.
		mockSearchBackend.mockReturnValue({ url: 'https://m', apiKey: 'k' });
		const result = await call('meili:20', 'jazz');
		expect(result.cursor).toBeNull();
		expect(mockRunSearch).not.toHaveBeenCalled();
	});
});

// The schema is the trust boundary for the load-more POST body — a legacy client
// mid-deploy, or a hostile one, can put anything in it. `v.object` STRIPS unknown
// keys, so only `cursor` and `q` ever reach runLoadMoreEvents and every filter
// value stays server-authoritative instead of client-echoed.
describe('listEventsInput accepts a client bag without trusting it', () => {
	it('strips a query-reconstruction bag down to the two fields that are read', () => {
		const parsed = v.parse(listEventsInput, {
			cursor: 'envelope-token',
			q: 'jazz',
			// What a pre-envelope client echoed, and what a hostile one would widen.
			pipeline: 'listRecords',
			sort: 'indexedAt',
			order: 'desc',
			limit: 500,
			startsAtMin: '1970-01-01T00:00:00.000Z',
			actor: 'did:plc:someone-else'
		});
		expect(parsed).toEqual({ cursor: 'envelope-token', q: 'jazz' });
	});

	it('accepts a cursor-only body and an empty one', () => {
		expect(v.parse(listEventsInput, { cursor: 'envelope-token' })).toEqual({
			cursor: 'envelope-token'
		});
		expect(v.parse(listEventsInput, {})).toEqual({});
	});

	it('rejects a mistyped cursor/q rather than coercing it', () => {
		expect(() => v.parse(listEventsInput, { cursor: 123 })).toThrow();
		expect(() => v.parse(listEventsInput, { q: ['jazz'] })).toThrow();
	});
});

describe("'happening-now-meili' continues a TERM-scoped live list", () => {
	// The term rides the remote input, never the envelope. A page that forgets to
	// send it strands the list at its first 20 results — which /events/now did,
	// because it never passed the term down to the list component at all.
	const backend = { url: 'https://meili.test', apiKey: 'k' };

	it('resumes on the search backend when the term is supplied', async () => {
		mockSearchBackend.mockReturnValue(backend);
		mockRunOngoingSearch.mockResolvedValue({
			events: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			handles: {},
			cursor: 'meili:40',
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runOngoingSearchPage>>);

		const result = await call(token({ v: 1, q: 'happening-now-meili', raw: 'meili:20' }), 'town');

		expect(mockRunOngoingSearch).toHaveBeenCalledWith(backend, expect.anything(), {
			q: 'town',
			cursor: 'meili:20'
		});
		expect(result.events).toHaveLength(1);
		// The continuation stays on the query that minted it.
		expect(decodeCursor(result.cursor)).toEqual({
			v: 1,
			q: 'happening-now-meili',
			raw: 'meili:40'
		});
	});

	it('ends cleanly without a term rather than continuing an unscoped live list', async () => {
		mockSearchBackend.mockReturnValue(backend);

		const result = await call(token({ v: 1, q: 'happening-now-meili', raw: 'meili:20' }));

		expect(result).toEqual({ events: [], handles: {}, cursor: null });
		expect(mockRunOngoingSearch).not.toHaveBeenCalled();
		noReads();
	});
});
