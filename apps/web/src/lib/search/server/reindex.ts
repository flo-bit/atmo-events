// D1 -> Meili reindex: replays every stored event record through a contrail
// Sink WITHOUT touching any PDS or writing any D1 row. The live sink only sees
// records as they are ingested, so events whose authoring DID finished backfill
// before the sink existed (or before a Meili outage recovered) never reach the
// search index. This reads them straight from `records_event` (SELECT only) and
// feeds them to the sink, which applies the same discoverable filter as live
// ingest (discoverable -> upsert, hidden -> delete). Idempotent: re-running just
// re-upserts the same docs.
import { EVENT_COLLECTION } from './meili-sink';
import type { ContrailConfig } from '@atmo-dev/contrail';

type Sink = NonNullable<ContrailConfig['sinks']>[number];
type RecordEvent = Parameters<Sink['onRecords']>[0][number];

/** The slice of the D1 client this reindex needs: a prepared, bound, paged
 *  SELECT. Kept minimal so tests can supply a fake without a real database. */
export interface ReindexDb {
	prepare(query: string): {
		bind(...args: unknown[]): {
			all(): Promise<{ results?: Array<Record<string, unknown>> }>;
		};
	};
}

export interface ReindexOptions {
	db: ReindexDb;
	sink: Sink;
	/** Rows per page / per sink batch. Default 500. */
	batchSize?: number;
	/** Called after each batch with the running total. */
	onProgress?: (total: number) => void;
}

/** Parse a stored `record` cell into a plain object, or null if it's missing /
 *  not valid JSON / not an object. The live ingest path uses safeParseJson, so a
 *  single poison row must be skipped, not allowed to abort the whole reindex. */
function parseRecordObject(raw: unknown): Record<string, unknown> | null {
	if (raw == null) return null;
	try {
		const parsed = JSON.parse(String(raw));
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** Pages `records_event` and feeds each batch to `sink.onRecords(..., {phase:
 *  'backfill'})`. Returns the number of event rows fed. */
export async function reindexEventsToSink(opts: ReindexOptions): Promise<number> {
	const { db, sink } = opts;
	const batchSize = opts.batchSize ?? 500;
	let offset = 0;
	let total = 0;

	for (;;) {
		const page = await db
			.prepare(
				'SELECT uri, did, rkey, cid, record, time_us FROM records_event ORDER BY uri LIMIT ? OFFSET ?'
			)
			.bind(batchSize, offset)
			.all();
		const rows = page.results ?? [];
		if (rows.length === 0) break;

		const records: RecordEvent[] = [];
		for (const r of rows) {
			// D1 stores `record` as a JSON string; the sink expects a parsed object.
			// Skip (don't throw on) a missing/corrupt cell so one poison row can't
			// abort coverage for the rest of the table.
			const record = parseRecordObject(r.record);
			if (!record) {
				console.warn(`[reindex] skipping ${String(r.uri)}: record is missing or not valid JSON`);
				continue;
			}
			records.push({
				kind: 'created',
				uri: String(r.uri),
				did: String(r.did),
				collection: EVENT_COLLECTION,
				rkey: String(r.rkey),
				// records_event has no `collection` column (one table per collection)
				// and may store a null cid; the sink wants a string.
				cid: r.cid == null ? '' : String(r.cid),
				record,
				time_us: Number(r.time_us)
			});
		}

		if (records.length > 0) await sink.onRecords(records, { phase: 'backfill' });
		total += records.length;
		// Advance by rows read (not records fed) so skipped rows don't stall paging.
		offset += rows.length;
		opts.onProgress?.(total);
		if (rows.length < batchSize) break;
	}

	return total;
}
