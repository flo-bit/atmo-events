import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOPICS } from '#lib/topics.js';
import { readTopicCounts, refreshTopicCounts, TOPIC_COUNTS_INTERVAL_MS } from './topic-counts';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const FUTURE = '2026-11-15T12:00:00.000Z';
const PAST = '2026-10-27T12:00:00.000Z';
const END = '2026-10-28T14:00:00.000Z';
const databases: DatabaseSync[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const sqlite of databases.splice(0)) sqlite.close();
});

// Real SQLite/FTS5, with the same URI map as the deployed Contrail backport.
// The small binding adapter preserves D1's atomic batch semantics.
function setup() {
	const sqlite = new DatabaseSync(':memory:');
	databases.push(sqlite);
	sqlite.exec(`
		CREATE TABLE records_event (uri TEXT PRIMARY KEY, record TEXT NOT NULL,
			did TEXT NOT NULL DEFAULT 'did:plc:test', cid TEXT);
		CREATE TABLE moderation_hidden (subject TEXT, cid TEXT, starts_at INTEGER, exp INTEGER);
		CREATE TABLE fts_event_rows (id INTEGER PRIMARY KEY, uri TEXT NOT NULL UNIQUE);
		CREATE VIRTUAL TABLE fts_event USING fts5(content);
	`);
	const bound = new WeakMap<D1PreparedStatement, { sql: string; params: SQLInputValue[] }>();
	function execute(sql: string, params: SQLInputValue[]) {
		const statement = sqlite.prepare(sql);
		if (statement.columns().length) {
			return { success: true, results: statement.all(...params), meta: { changes: 0 } };
		}
		return {
			success: true,
			results: [],
			meta: { changes: Number(statement.run(...params).changes) }
		};
	}
	function prepare(sql: string, params: SQLInputValue[] = []): D1PreparedStatement {
		const statement = {
			bind: (...values: SQLInputValue[]) => prepare(sql, values),
			run: async () => execute(sql, params),
			all: async () => execute(sql, params),
			first: async () => sqlite.prepare(sql).get(...params) ?? null
		} as unknown as D1PreparedStatement;
		bound.set(statement, { sql, params });
		return statement;
	}
	const db = {
		prepare,
		batch: async (statements: D1PreparedStatement[]) => {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((statement) => {
					const { sql, params } = bound.get(statement)!;
					return execute(sql, params);
				});
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		}
	} as unknown as D1Database;
	let sequence = 0;
	function add(record: Record<string, unknown>) {
		const uri = `at://did:plc:test/community.lexicon.calendar.event/${++sequence}`;
		sqlite
			.prepare('INSERT INTO records_event (uri, record) VALUES (?, ?)')
			.run(uri, JSON.stringify(record));
		const mapping = sqlite.prepare('INSERT INTO fts_event_rows (uri) VALUES (?)').run(uri);
		sqlite
			.prepare('INSERT INTO fts_event (rowid, content) VALUES (?, ?)')
			.run(
				mapping.lastInsertRowid,
				['mode', 'name', 'status', 'description'].map((field) => record[field] ?? '').join(' ')
			);
	}
	return { db, sqlite, add };
}

describe('daily topic counts', () => {
	it('excludes moderated records from aggregates', async () => {
		const { db, sqlite, add } = setup();
		add({ name: '#tech', startsAt: FUTURE });
		sqlite.prepare("INSERT INTO moderation_hidden VALUES (?, '', NULL, NULL)").run('did:plc:test');
		await refreshTopicCounts(db, NOW);
		expect((await readTopicCounts(db))!.counts.technology).toBe(0);
	});
	it('counts the union of upcoming and ongoing public matches, once per event per topic', async () => {
		const { db, add } = setup();
		add({ name: '#tech #technology', startsAt: FUTURE }); // no endsAt is valid
		add({ name: 'Meetup', description: '#technology #ai', startsAt: FUTURE });
		add({ name: '#tech', startsAt: PAST, endsAt: END }); // ongoing
		add({ name: '#tech', startsAt: new Date(NOW).toISOString(), endsAt: END }); // both bands
		add({ name: '#tech', startsAt: PAST, endsAt: new Date(NOW).toISOString() }); // inclusive band bound
		add({ name: '#tech', startsAt: PAST, endsAt: PAST }); // ended
		add({ name: '#tech', startsAt: PAST }); // not known to be ongoing
		add({ name: '#tech', endsAt: END }); // no startsAt, matches neither band
		add({ name: '#tech', startsAt: FUTURE, preferences: { showInDiscovery: false } });
		add({ name: '#tech', startsAt: FUTURE, preferences: { showInDiscovery: 0 } });
		add({ name: '#tech', startsAt: FUTURE, preferences: { showInDiscovery: null } });
		add({ name: '#tech', startsAt: FUTURE, preferences: { showInDiscovery: true } });
		add({ name: '#ai #webdev #opensource #crypto', startsAt: FUTURE }); // one merged match
		add({ name: '#machinelearning', startsAt: FUTURE });
		add({ name: '#frontend', startsAt: FUTURE });
		add({ name: '#foss', startsAt: FUTURE });
		add({ name: '#bitcoin', startsAt: FUTURE });
		add({ name: '#music', startsAt: FUTURE });
		add({ name: '#cooking #foodie', startsAt: FUTURE });
		add({ name: '#yoga #fitness', startsAt: FUTURE });
		add({ name: '#film #photography #art', startsAt: FUTURE });

		await refreshTopicCounts(db, NOW);
		const snapshot = (await readTopicCounts(db))!;
		expect(snapshot.updatedAt).toBe(NOW);
		expect(Object.keys(snapshot.counts)).toHaveLength(TOPICS.length);
		expect(snapshot.counts).toMatchObject({
			technology: 12,
			music: 1,
			'food-drink': 1,
			fitness: 1,
			'arts-culture': 1,
			sports: 0
		});
	});

	it('skips expensive counts until 24h have elapsed, then includes new events and drops ended ones', async () => {
		const { db, add } = setup();
		add({ name: '#music', startsAt: PAST, endsAt: END });
		await refreshTopicCounts(db, NOW);
		add({ name: '#tech', startsAt: FUTURE });
		const prepare = vi.spyOn(db, 'prepare');
		await refreshTopicCounts(db, NOW + TOPIC_COUNTS_INTERVAL_MS - 1);
		expect(prepare.mock.calls.some(([sql]) => sql.includes('SELECT COUNT(*)'))).toBe(false);
		expect((await readTopicCounts(db))!.counts).toMatchObject({ music: 1, technology: 0 });
		await refreshTopicCounts(db, NOW + TOPIC_COUNTS_INTERVAL_MS);
		expect((await readTopicCounts(db))!).toMatchObject({
			updatedAt: NOW + TOPIC_COUNTS_INTERVAL_MS,
			counts: { music: 0, technology: 1 }
		});
	});

	it('keeps the last successful snapshot on failure and retries on the next tick', async () => {
		const { db, sqlite, add } = setup();
		add({ name: '#tech', startsAt: FUTURE });
		await refreshTopicCounts(db, NOW);
		const previous = await readTopicCounts(db);
		add({ name: '#tech', startsAt: FUTURE });
		sqlite.exec(`CREATE TRIGGER fail_snapshot BEFORE UPDATE OF counts ON topic_counts_cache
			BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`);
		const later = NOW + TOPIC_COUNTS_INTERVAL_MS;
		await expect(refreshTopicCounts(db, later)).rejects.toThrow('simulated write failure');
		expect(await readTopicCounts(db)).toEqual(previous);
		expect(sqlite.prepare('SELECT lease_until FROM topic_counts_cache').get()?.lease_until).toBe(0);
		sqlite.exec('DROP TRIGGER fail_snapshot');
		await refreshTopicCounts(db, later + 60_000);
		expect((await readTopicCounts(db))!.counts.technology).toBe(2);
	});

	it('allows only one overlapping tick to calculate the snapshot', async () => {
		const { db } = setup();
		const prepare = vi.spyOn(db, 'prepare');
		await Promise.all([refreshTopicCounts(db, NOW), refreshTopicCounts(db, NOW)]);
		expect(prepare.mock.calls.filter(([sql]) => sql.includes('SELECT COUNT(*)'))).toHaveLength(
			TOPICS.length
		);
	});

	it('recovers an expired lease after a crashed refresh', async () => {
		const { db, sqlite, add } = setup();
		await refreshTopicCounts(db, NOW);
		add({ name: '#tech', startsAt: FUTURE });
		const later = NOW + TOPIC_COUNTS_INTERVAL_MS;
		sqlite
			.prepare('UPDATE topic_counts_cache SET lease_token = ?, lease_until = ?')
			.run('crashed', later + 60_000);
		await refreshTopicCounts(db, later);
		expect((await readTopicCounts(db))!.counts.technology).toBe(0);
		await refreshTopicCounts(db, later + 60_000);
		expect((await readTopicCounts(db))!.counts.technology).toBe(1);
	});

	it('invalidates a changed topic definition and refreshes even inside the daily interval', async () => {
		const { db, sqlite, add } = setup();
		await refreshTopicCounts(db, NOW);
		sqlite.exec("UPDATE topic_counts_cache SET definition = 'old topics'");
		expect(await readTopicCounts(db)).toBeNull();
		add({ name: '#film', startsAt: FUTURE });
		await refreshTopicCounts(db, NOW + 60_000);
		expect((await readTopicCounts(db))!.counts['arts-culture']).toBe(1);
	});

	it('serves stale counts with one cache read and no refresh on the request path', async () => {
		const { db } = setup();
		await refreshTopicCounts(db, NOW);
		const prepare = vi.spyOn(db, 'prepare');
		expect((await readTopicCounts(db))!.updatedAt).toBe(NOW);
		expect(prepare).toHaveBeenCalledTimes(1);
		expect(prepare.mock.calls[0][0]).not.toContain('records_event');
	});
});
