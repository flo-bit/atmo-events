import type { Notify, SqlDatabase } from '@atmo-dev/notify';

export const EVENT = 'community.lexicon.calendar.event';
export const RSVP = 'community.lexicon.calendar.rsvp';

export type FeedRow = {
	uri: string;
	collection: string;
	operation: 'create' | 'update' | 'delete';
	indexed_at: number;
};

type Cursor = [indexedAt: number, uri: string];
type State = { epoch: string | null; create: Cursor; update: Cursor; delete: Cursor };

/**
 * What each operation can mean for notifications. A newly created event has no
 * responses yet, so bulk imports are filtered out in SQL instead of being paged.
 */
const WANTED = { create: [RSVP], update: [EVENT, RSVP], delete: [EVENT] } as const;
const KEY = 'rsvp:feed';

/**
 * Reads record versions indexed since the last tick: the only code that knows
 * Contrail's tables. `record_versions` has one row per record, so several edits
 * between ticks arrive as one. Each operation is queried separately so the
 * existing `(operation, indexed_at)` index bounds the read to new rows.
 *
 * Only live sources are read, so backfills and rebuilds notify nobody. Call
 * `commit` after the rows' effects are stored; a crash before it replays them.
 */
export async function readFeed(options: {
	db: SqlDatabase;
	notify: Notify<string>;
	now: number;
	/** Projection generation. A different one restarts the feed from now. */
	epoch: string | null;
	sources: string[];
	/** Rows this recent may still be uncommitted by a concurrent writer. */
	lag: number;
	limit?: number;
}) {
	const { db, notify, epoch, sources, limit = 2000 } = options;
	const upper = (options.now - options.lag) * 1000;
	const done: Cursor = [upper, '~']; // Sorts after every at:// URI.
	const saved = await notify.peek(KEY);
	const state: State | null = saved ? JSON.parse(saved) : null;
	const save = (next: State) => notify.track(KEY, JSON.stringify(next));
	if (!state || state.epoch !== epoch) {
		// First run or a rebuilt projection: nothing indexed so far is news.
		await save({ epoch, create: done, update: done, delete: done });
		return { rows: [] as FeedRow[], commit: async () => {} };
	}

	const rows: FeedRow[] = [];
	const next: State = { ...state };
	for (const operation of ['create', 'update', 'delete'] as const) {
		const collections = WANTED[operation];
		const { results } = await db
			.prepare(
				`SELECT uri, collection, operation, indexed_at FROM record_versions
				 WHERE operation = ? AND (indexed_at, uri) > (?, ?) AND indexed_at <= ?
				 AND source_id IN (${sources.map(() => '?').join(', ')})
				 AND collection IN (${collections.map(() => '?').join(', ')})
				 ORDER BY indexed_at, uri LIMIT ?`
			)
			.bind(operation, ...state[operation], upper, ...sources, ...collections, limit)
			.all<FeedRow>();
		rows.push(...results);
		const last = results.at(-1);
		next[operation] = results.length === limit && last ? [last.indexed_at, last.uri] : done;
	}
	return { rows, commit: () => save(next) };
}
