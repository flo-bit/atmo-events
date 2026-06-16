import { afterEach, describe, expect, it, vi } from 'vitest';

// The search load decides between two backends whose cursors are NOT
// interchangeable: Meilisearch (offset cursor) and the D1 LIKE fallback (opaque
// cursor). loadMoreEvents re-routes to Meili whenever a backend is configured,
// so a D1 cursor handed back after a backend failure would be misread. And even
// with no backend at all, loadMoreEvents paginates via listRecords — without the
// discoverable filter or startsAtMin this load applies — so its cursor isn't
// safe to continue either. The D1 fallback is therefore first-batch-only. These
// tests pin that contract.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	flattenEventRecords: vi.fn((records: unknown[]) => records),
	listDiscoverableEventsFromContrail: vi.fn()
}));
vi.mock('$lib/search/server/query', () => ({
	searchBackendFromEnv: vi.fn(),
	runEventSearchPage: vi.fn()
}));

import { load } from './+page.server';
import { flattenEventRecords, listDiscoverableEventsFromContrail } from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';

const mockSearchBackendFromEnv = vi.mocked(searchBackendFromEnv);
const mockRunEventSearchPage = vi.mocked(runEventSearchPage);
const mockListDiscoverable = vi.mocked(listDiscoverableEventsFromContrail);

type LoadResult = {
	events: unknown[];
	handles: Record<string, string>;
	cursor: string | null;
	query: string;
};

const runLoad = async (q: string, cursor?: string) => (await load(event(q, cursor))) as LoadResult;

function event(q: string, cursor?: string) {
	const url = new URL('https://atmo.test/search');
	if (q) url.searchParams.set('q', q);
	if (cursor) url.searchParams.set('cursor', cursor);
	// platform.env is opaque here; the query module is mocked, so its contents
	// only matter to the (mocked) searchBackendFromEnv.
	return { url, platform: { env: {} } } as unknown as Parameters<typeof load>[0];
}

afterEach(() => vi.clearAllMocks());

describe('search page load', () => {
	it('returns early for an empty query without touching any backend', async () => {
		const result = await load(event(''));
		expect(result).toEqual({ events: [], handles: {}, cursor: null, query: '' });
		expect(mockSearchBackendFromEnv).not.toHaveBeenCalled();
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});

	it('serves the Meili page (offset cursor) when the backend succeeds', async () => {
		mockSearchBackendFromEnv.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockRunEventSearchPage.mockResolvedValue({
			events: [{ uri: 'at://did:plc:a/community.lexicon.calendar.event/1' }],
			handles: { 'did:plc:a': 'alice' },
			cursor: '20',
			distances: {}
		} as unknown as Awaited<ReturnType<typeof runEventSearchPage>>);

		const result = await runLoad('kite');

		expect(result.cursor).toBe('20');
		expect(result.events).toHaveLength(1);
		expect(mockListDiscoverable).not.toHaveBeenCalled();
	});

	it('drops the D1 cursor when a configured backend fails, so load-more cannot misroute it', async () => {
		mockSearchBackendFromEnv.mockReturnValue({ url: 'https://meili.test', apiKey: 'k' });
		mockRunEventSearchPage.mockRejectedValue(new Error('meili down'));
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:b/community.lexicon.calendar.event/2' }],
			profiles: [{ did: 'did:plc:b', handle: 'bob' }],
			cursor: 'd1-opaque-cursor'
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await runLoad('kite');

		// Events still served from the D1 fallback...
		expect(result.events).toHaveLength(1);
		expect(result.handles).toEqual({ 'did:plc:b': 'bob' });
		// ...but the incompatible D1 cursor is suppressed.
		expect(result.cursor).toBeNull();
		expect(flattenEventRecords).toHaveBeenCalled();
	});

	it('drops the D1 cursor when no backend is configured, so load-more cannot drift past the first batch', async () => {
		mockSearchBackendFromEnv.mockReturnValue(null);
		mockListDiscoverable.mockResolvedValue({
			records: [{ uri: 'at://did:plc:c/community.lexicon.calendar.event/3' }],
			profiles: [],
			cursor: 'd1-opaque-cursor'
		} as unknown as Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>);

		const result = await runLoad('kite');

		// First batch is served from the discoverable, upcoming-only D1 query...
		expect(result.events).toHaveLength(1);
		// ...but the cursor is suppressed: loadMoreEvents would paginate via
		// listRecords without the discoverable filter or startsAtMin, drifting
		// into past and non-discoverable events on later pages.
		expect(result.cursor).toBeNull();
		expect(mockRunEventSearchPage).not.toHaveBeenCalled();
	});
});
