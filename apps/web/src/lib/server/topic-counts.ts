import { ftsQueryClause, sqliteDialect } from '@atmo-dev/contrail-appview';
import { TOPICS, orQueryFromSlug } from '#lib/topics.js';
import { discoverableSql } from '#lib/search/server/discoverability.js';

export const TOPIC_COUNTS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 5 * 60 * 1000;
// A topic/hashtag change invalidates the snapshot without waiting another day.
const DEFINITION = JSON.stringify(TOPICS.map(({ slug }) => [slug, orQueryFromSlug(slug)]));
const fts = ftsQueryClause(sqliteDialect, 'records_event');

export type TopicCounts = {
	counts: Record<string, number>;
	updatedAt: number;
};

/** Cron owns schema creation and all expensive work. Page loads only read one row. */
async function ensureSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS topic_counts_cache (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			counts TEXT,
			updated_at INTEGER,
			definition TEXT,
			lease_token TEXT,
			lease_until INTEGER NOT NULL DEFAULT 0
		)`),
		db.prepare('INSERT OR IGNORE INTO topic_counts_cache (id) VALUES (1)')
	]);
}

/** Returns stale-but-valid counts too; a failed refresh must not erase them.
 * A changed topic definition is not valid, since it describes different queries. */
export async function readTopicCounts(db: D1Database): Promise<TopicCounts | null> {
	const row = await db
		.prepare('SELECT counts, updated_at, definition FROM topic_counts_cache WHERE id = 1')
		.first<{ counts: string | null; updated_at: number | null; definition: string | null }>();
	if (!row?.counts || row.updated_at === null || row.definition !== DEFINITION) return null;
	const counts = JSON.parse(row.counts) as Record<string, number>;
	if (!counts || TOPICS.some(({ slug }) => !Number.isSafeInteger(counts[slug]) || counts[slug] < 0))
		return null;
	return { counts, updatedAt: row.updated_at };
}

/** Daily, exact aggregate counts, never paginated/hydrated records. One common
 * timestamp and one atomic snapshot keep the tiles consistent. The predicate is
 * the union of the topic page's upcoming list and its ongoing band: future
 * events need no endsAt; past starts only qualify while their endsAt is >= now.
 * FTS matches each record once even when it contains several tracked terms.
 * A short atomic lease prevents overlapping ticks; failures release it so the
 * next tick can retry, while crashed workers recover after the lease expires. */
export async function refreshTopicCounts(db: D1Database, now = Date.now()): Promise<void> {
	await ensureSchema(db);
	const token = crypto.randomUUID();
	const claim = await db
		.prepare(
			`UPDATE topic_counts_cache SET lease_token = ?, lease_until = ?
			WHERE id = 1 AND lease_until <= ?
			AND (updated_at IS NULL OR updated_at <= ? OR definition IS NULL OR definition != ?)`
		)
		.bind(token, now + REFRESH_LEASE_MS, now, now - TOPIC_COUNTS_INTERVAL_MS, DEFINITION)
		.run();
	if (!(claim.meta?.changes > 0)) return;

	try {
		const asOf = new Date(now).toISOString();
		const results = await db.batch<{ count: number }>(
			TOPICS.map(({ slug }) =>
				db
					.prepare(
						`SELECT COUNT(*) AS count FROM records_event r ${fts.join}
					WHERE ${fts.condition} AND ${discoverableSql('r.record')}
					AND (json_extract(r.record, '$.startsAt') >= ?
						OR (json_extract(r.record, '$.startsAt') <= ?
							AND json_extract(r.record, '$.endsAt') >= ?))`
					)
					.bind(orQueryFromSlug(slug), asOf, asOf, asOf)
			)
		);
		const counts: Record<string, number> = {};
		for (const [index, topic] of TOPICS.entries()) {
			const count = results[index]?.results?.[0]?.count;
			if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
				throw new Error(`Invalid event count for topic ${topic.slug}`);
			}
			counts[topic.slug] = count;
		}
		// Only the current lease holder may publish. Readers never see partial counts.
		await db
			.prepare(
				`UPDATE topic_counts_cache SET counts = ?, updated_at = ?, definition = ?
				WHERE id = 1 AND lease_token = ?`
			)
			.bind(JSON.stringify(counts), now, DEFINITION, token)
			.run();
	} finally {
		await db
			.prepare(
				`UPDATE topic_counts_cache SET lease_token = NULL, lease_until = 0
				WHERE id = 1 AND lease_token = ?`
			)
			.bind(token)
			.run();
	}
}
