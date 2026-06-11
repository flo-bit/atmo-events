// Assembles a result page from Meilisearch hits + D1-hydrated records.
// Meilisearch only ranks (and measures distance); D1 is the display source of
// truth, so hits that fail hydration — stale index entries, undiscoverable
// events, or docs for records this instance never ingested — are dropped.
// `consumed` is how many hits (in rank order) were examined to build the page;
// the caller advances its Meilisearch offset cursor by it, so dropped hits are
// never re-scanned and unserved hits are never skipped.
import type { SearchHit } from './meili';

export function assembleSearchPage<T extends { uri: string }>(
	hits: SearchHit[],
	records: T[],
	pageSize: number
): { items: { record: T; distanceMeters?: number }[]; consumed: number } {
	const byUri = new Map(records.map((r) => [r.uri, r]));
	const items: { record: T; distanceMeters?: number }[] = [];
	let consumed = 0;

	for (const [index, hit] of hits.entries()) {
		const record = byUri.get(hit.uri);
		if (!record) continue;
		items.push({
			record,
			...(hit.distanceMeters !== undefined ? { distanceMeters: hit.distanceMeters } : {})
		});
		consumed = index + 1;
		if (items.length === pageSize) return { items, consumed };
	}
	// Hits exhausted before the page filled: everything was examined.
	return { items, consumed: hits.length };
}
