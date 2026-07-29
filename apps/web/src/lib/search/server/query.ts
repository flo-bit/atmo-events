// Search/near-me page flow: Meilisearch ranks, D1 supplies the records.
// Shared by the search page load, its load-more remote command, and the
// near-me page, so first page and pagination can't drift apart.
import type { Client } from '@atcute/client';
import {
	searchEvents,
	nearMeEvents,
	ongoingEvents,
	type SearchBackend,
	type SearchHit,
	type SearchResult
} from './meili';
import { assembleSearchPage } from './page';
import { SEARCH_PAGE_SIZE, SEARCH_OVERFETCH } from '../constants';
import {
	flattenEventRecords,
	listDiscoverableEventsByUrisFromContrail,
	type FlatEventRecord
} from '$lib/contrail';
import { parseCursor, tagCursor } from '$lib/contrail/cursor';

export interface SearchPageResult {
	events: FlatEventRecord[];
	handles: Record<string, string>;
	/** Meilisearch offset of the next unexamined hit, or null when exhausted. */
	cursor: string | null;
	/** Meters from the query point, by event uri (near-me only). */
	distances: Record<string, number>;
}

export function searchBackendFromEnv(env?: {
	SEARCH_URL?: string;
	SEARCH_API_KEY?: string;
	SEARCH_INDEX?: string;
}): SearchBackend | null {
	if (!env?.SEARCH_URL || !env?.SEARCH_API_KEY) return null;
	// SEARCH_INDEX (default `events`) is the single index var shared with the
	// sink, so the read path always queries the index the sink fills.
	return { url: env.SEARCH_URL, apiKey: env.SEARCH_API_KEY, indexUid: env.SEARCH_INDEX };
}

function parseOffsetCursor(cursor: string | null | undefined): number {
	// Accept both a tagged `meili:<n>` cursor (a load-more round-trip) and a bare
	// `<n>` (first page, or a legacy pre-deploy cursor). A D1-tagged keyset should
	// never reach here now that load-more routes by tag — but if one does, treat
	// it as offset 0 (a clean restart) rather than Number(base64url) -> NaN, which
	// this guard already collapses to 0 anyway.
	const { backend, raw } = parseCursor(cursor);
	if (backend === 'd1') return 0;
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? n : 0;
}

async function hydrateToPage(
	client: Client,
	result: SearchResult,
	offset: number
): Promise<SearchPageResult> {
	const hydration = await listDiscoverableEventsByUrisFromContrail(client, {
		uris: result.hits.map((h: SearchHit) => h.uri)
	});
	// A null hydration means the D1 read itself failed, distinct from an empty
	// records list (a legitimately-empty result). Treating failure as "empty"
	// would drop every hit yet still advance the cursor, silently skipping up to
	// a full batch for the rest of the pagination session. Throw instead: text
	// search recovers via its D1 fallback (see +page.server.ts), and near-me
	// surfaces an error rather than quietly losing results.
	if (!hydration) throw new Error('search hydration failed');
	const { items, consumed } = assembleSearchPage(result.hits, hydration.records, SEARCH_PAGE_SIZE);

	const handles: Record<string, string> = {};
	for (const p of hydration.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	const distances: Record<string, number> = {};
	for (const item of items) {
		if (item.distanceMeters !== undefined) distances[item.record.uri] = item.distanceMeters;
	}

	// More pages remain when either we stopped before draining this batch (the
	// page filled with hits left over), or the batch came back at the requested
	// size (Meilisearch likely has more beyond this offset). We deliberately do
	// NOT gate on estimatedTotalHits: it is an estimate and can undercount,
	// which would null the cursor while real matches are still unreachable. An
	// overcount instead costs one extra fetch that returns nothing and ends.
	const requestedLimit = SEARCH_PAGE_SIZE * SEARCH_OVERFETCH;
	const moreToScan = consumed < result.hits.length || result.hits.length === requestedLimit;

	const next = offset + consumed;
	return {
		events: flattenEventRecords(items.map((i) => i.record)),
		handles,
		// Tag the offset with the Meili backend so load-more continues on Meili and
		// never feeds this number to D1 listRecords (om-7dbs).
		cursor: consumed > 0 && moreToScan ? tagCursor('meili', String(next)) : null,
		distances
	};
}

export async function runEventSearchPage(
	backend: SearchBackend,
	client: Client,
	{ q, cursor }: { q: string; cursor?: string | null }
): Promise<SearchPageResult> {
	const offset = parseOffsetCursor(cursor);
	const result = await searchEvents(backend, {
		q,
		limit: SEARCH_PAGE_SIZE * SEARCH_OVERFETCH,
		offset
	});
	return hydrateToPage(client, result, offset);
}

/**
 * One page of events UNDER WAY matching a term, ranked by the search backend.
 *
 * The term-scoped band and the `/events/now` page its "see all" links to both go
 * through here, so the two cannot disagree about what matches. They did: the band
 * ran on D1 while the list beside it ran on Meili, the page promoted any live
 * event out of that list into the band, and the D1-only destination could not
 * contain what Meili had ranked and D1 had not. "See all" then led to a shorter
 * list than the block it was offered beside.
 */
export async function runOngoingSearchPage(
	backend: SearchBackend,
	client: Client,
	{ q, cursor }: { q: string; cursor?: string | null }
): Promise<SearchPageResult> {
	const offset = parseOffsetCursor(cursor);
	const result = await ongoingEvents(backend, {
		q,
		limit: SEARCH_PAGE_SIZE * SEARCH_OVERFETCH,
		offset
	});
	return hydrateToPage(client, result, offset);
}

export async function runNearMePage(
	backend: SearchBackend,
	client: Client,
	{
		lat,
		lng,
		radiusMeters,
		cursor
	}: { lat: number; lng: number; radiusMeters: number; cursor?: string | null }
): Promise<SearchPageResult> {
	const offset = parseOffsetCursor(cursor);
	const result = await nearMeEvents(backend, {
		lat,
		lng,
		radiusMeters,
		limit: SEARCH_PAGE_SIZE * SEARCH_OVERFETCH,
		offset
	});
	return hydrateToPage(client, result, offset);
}
