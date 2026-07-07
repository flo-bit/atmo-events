import { afterEach, describe, expect, it, vi } from 'vitest';

// runLoadMoreEvents must re-run the SAME read pipeline page 1 used. The bug
// (om-5iiw) was that it always called listRecords, so the discoverable filter
// (home) and the authored filter (profile hosting/past) were dropped on page
// 2+, leaking unlisted events and conference talks. These tests pin the
// routing: the `pipeline` selector picks the matching contrail fn and is
// stripped from the params handed to it (it is our selector, not an xrpc param).
vi.mock('./index', () => ({
	getServerClient: vi.fn(() => ({}))
}));
vi.mock('$lib/contrail', () => ({
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listEventRecordsFromContrail: vi.fn(),
	listDiscoverableEventsFromContrail: vi.fn(),
	listAuthoredEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(() => null),
	runEventSearchPage: vi.fn()
}));

import { runLoadMoreEvents, type LoadMoreEventsInput } from './events-load-more';
import {
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';

const mockRecords = vi.mocked(listEventRecordsFromContrail);
const mockDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);
const mockAuthored = vi.mocked(listAuthoredEventsFromContrail);
const mockSearchBackend = vi.mocked(searchBackendFromEnv);

const emptyPage = { records: [], profiles: [], cursor: 'next' } as unknown as Awaited<
	ReturnType<typeof listEventRecordsFromContrail>
>;

// env is opaque here — getServerClient is mocked, and the search backend is
// resolved via the (mocked) searchBackendFromEnv.
const env = { DB: {} } as unknown as App.Platform['env'];
const call = (input: Partial<LoadMoreEventsInput>) =>
	runLoadMoreEvents(env, input as LoadMoreEventsInput);

afterEach(() => vi.clearAllMocks());

describe('runLoadMoreEvents pipeline routing', () => {
	it("routes pipeline:'discoverable' to listDiscoverable, never listRecords", async () => {
		mockDiscoverable.mockResolvedValue(emptyPage);

		await call({ pipeline: 'discoverable', startsAtMin: '2026-01-01T00:00:00Z', cursor: 'c' });

		expect(mockDiscoverable).toHaveBeenCalledTimes(1);
		expect(mockRecords).not.toHaveBeenCalled();
		expect(mockAuthored).not.toHaveBeenCalled();
	});

	it("routes pipeline:'authored' to listAuthored, never listRecords", async () => {
		mockAuthored.mockResolvedValue(emptyPage);

		await call({ pipeline: 'authored', actor: 'did:plc:alice', cursor: 'c' });

		expect(mockAuthored).toHaveBeenCalledTimes(1);
		expect(mockRecords).not.toHaveBeenCalled();
		expect(mockDiscoverable).not.toHaveBeenCalled();
	});

	it('falls back to plain listRecords when no pipeline is given', async () => {
		mockRecords.mockResolvedValue(emptyPage);

		await call({ cursor: 'c' });

		expect(mockRecords).toHaveBeenCalledTimes(1);
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(mockAuthored).not.toHaveBeenCalled();
	});

	it('strips the pipeline selector but forwards the real filters', async () => {
		mockDiscoverable.mockResolvedValue(emptyPage);

		await call({ pipeline: 'discoverable', rsvpsCountMin: 2, cursor: 'c' });

		const params = mockDiscoverable.mock.calls[0][1];
		expect(params).not.toHaveProperty('pipeline');
		expect(params).toMatchObject({ rsvpsCountMin: 2, cursor: 'c' });
	});

	it('does not consult the search backend for a non-search load', async () => {
		mockDiscoverable.mockResolvedValue(emptyPage);

		await call({ pipeline: 'discoverable', cursor: 'c' });

		expect(mockSearchBackend).not.toHaveBeenCalled();
	});

	it('tags the D1 cursor it returns to the client with the d1 backend', async () => {
		mockDiscoverable.mockResolvedValue(emptyPage); // cursor: 'next'

		const result = await call({ pipeline: 'discoverable', cursor: 'd1:opaque' });

		expect(result.cursor).toBe('d1:next');
	});
});

// The om-7dbs bug class: a page whose FIRST load came from one backend but whose
// load-more re-derived the OTHER, handing over an incompatible cursor. Routing
// by the cursor's own tag pins each continuation to the backend that issued it.
describe('runLoadMoreEvents backend routing by cursor tag', () => {
	const mockRunSearch = vi.mocked(runEventSearchPage);
	const searchPage = {
		events: [],
		handles: {},
		cursor: 'meili:40'
	} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>;

	it('keeps a d1-tagged cursor on D1 even with a search term AND Meili configured', async () => {
		// PR #49's trip case: D1 first page + search term + configured Meili. The
		// old inference re-routed to Meili and NaN-parsed the keyset into a page-1
		// refetch. The tag must win: stay on D1, filters intact.
		mockSearchBackend.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockDiscoverable.mockResolvedValue(emptyPage);

		const result = await call({
			pipeline: 'discoverable',
			search: 'jazz',
			startsAtMin: '2026-01-01T00:00:00Z',
			cursor: 'd1:keyset'
		});

		expect(mockRunSearch).not.toHaveBeenCalled();
		expect(mockDiscoverable).toHaveBeenCalledTimes(1);
		const params = mockDiscoverable.mock.calls[0][1];
		// The untagged keyset is forwarded to D1; filters survive.
		expect(params).toMatchObject({
			cursor: 'keyset',
			search: 'jazz',
			startsAtMin: '2026-01-01T00:00:00Z'
		});
		expect(result.cursor).toBe('d1:next');
	});

	it('keeps a meili-tagged cursor on Meili and hands it the untagged offset', async () => {
		mockSearchBackend.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockRunSearch.mockResolvedValue(searchPage);

		const result = await call({ search: 'jazz', cursor: 'meili:20' });

		expect(mockRunSearch).toHaveBeenCalledTimes(1);
		expect(mockRunSearch.mock.calls[0][2]).toMatchObject({ q: 'jazz', cursor: '20' });
		expect(mockRecords).not.toHaveBeenCalled();
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(result.cursor).toBe('meili:40');
	});

	it('fails safe (ends pagination) for a meili-tagged cursor when no backend is configured', async () => {
		// The Meili offset is meaningless to D1 listRecords; rather than restart
		// page 1 on D1 or NaN-parse, end pagination.
		mockSearchBackend.mockReturnValue(null);

		const result = await call({ search: 'jazz', cursor: 'meili:20' });

		expect(mockRunSearch).not.toHaveBeenCalled();
		expect(mockRecords).not.toHaveBeenCalled();
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('fails safe for a meili-tagged cursor when the search term was lost from the continuation', async () => {
		mockSearchBackend.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });

		const result = await call({ cursor: 'meili:20' });

		expect(mockRunSearch).not.toHaveBeenCalled();
		expect(mockDiscoverable).not.toHaveBeenCalled();
		expect(result).toEqual({ events: [], handles: {}, cursor: null });
	});

	it('legacy untagged cursor + search + Meili configured falls back to the old inference (Meili)', async () => {
		mockSearchBackend.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockRunSearch.mockResolvedValue(searchPage);

		const result = await call({ search: 'jazz', cursor: '20' });

		expect(mockRunSearch).toHaveBeenCalledTimes(1);
		// The legacy offset is passed through for the Meili path to parse.
		expect(mockRunSearch.mock.calls[0][2]).toMatchObject({ q: 'jazz', cursor: '20' });
		expect(result.cursor).toBe('meili:40');
	});

	it('legacy untagged cursor with no search context falls back to D1', async () => {
		mockRecords.mockResolvedValue(emptyPage);

		const result = await call({ cursor: 'legacyOpaqueKeyset' });

		expect(mockRecords).toHaveBeenCalledTimes(1);
		expect(mockRecords.mock.calls[0][1]).toMatchObject({ cursor: 'legacyOpaqueKeyset' });
		expect(mockRunSearch).not.toHaveBeenCalled();
		expect(result.cursor).toBe('d1:next');
	});
});
