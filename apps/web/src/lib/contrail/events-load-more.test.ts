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
import { searchBackendFromEnv } from '$lib/search/server/query';

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
});
