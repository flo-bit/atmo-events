// Search/near-me page flow: Meilisearch ranks, D1 supplies the records.
// Shared by the search page load, its load-more remote command, and the
// near-me page, so first page and pagination can't drift apart.
import type { Client } from '@atcute/client';
import {
	searchEvents,
	nearMeEvents,
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
}): SearchBackend | null {
	if (!env?.SEARCH_URL || !env?.SEARCH_API_KEY) return null;
	return { url: env.SEARCH_URL, apiKey: env.SEARCH_API_KEY };
}

function parseOffsetCursor(cursor: string | null | undefined): number {
	const n = Number(cursor);
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
	const { items, consumed } = assembleSearchPage(
		result.hits,
		hydration?.records ?? [],
		SEARCH_PAGE_SIZE
	);

	const handles: Record<string, string> = {};
	for (const p of hydration?.profiles ?? []) {
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
		cursor: consumed > 0 && moreToScan ? String(next) : null,
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
