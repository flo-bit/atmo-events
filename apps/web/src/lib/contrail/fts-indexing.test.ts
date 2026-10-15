import { describe, expect, it } from 'vitest';
import {
	applyEvents,
	buildFtsTables,
	ftsQueryClause,
	initSchema,
	resolveConfig,
	sqliteDialect,
	type Database,
	type IngestEvent,
	type Statement
} from '@atmo-dev/contrail-appview';

type CapturedStatement = Statement & {
	sql: string;
	params: unknown[];
};

function recordingDb({ legacyFts = false }: { legacyFts?: boolean } = {}) {
	const runs: CapturedStatement[] = [];
	const batches: CapturedStatement[][] = [];

	const prepare = (sql: string): CapturedStatement => {
		const statement: CapturedStatement = {
			sql,
			params: [],
			bind(...values: unknown[]) {
				statement.params = values;
				return statement;
			},
			async run() {
				runs.push(statement);
				return {};
			},
			async all<T>() {
				const results =
					legacyFts && sql.startsWith('PRAGMA table_info(fts_event)')
						? [{ name: 'uri' }, { name: 'content' }]
						: [];
				return { results: results as T[] };
			},
			async first<T>() {
				if (sql.includes('AS expected_rows')) {
					return {
						expected_rows: 0,
						mapping_rows: 0,
						fts_rows: 0,
						joined_rows: 0
					} as T;
				}
				return null;
			}
		};
		return statement;
	};

	const db: Database = {
		prepare,
		async batch(statements) {
			batches.push(statements as CapturedStatement[]);
			return [];
		},
		dialect: sqliteDialect
	};

	return { db, runs, batches };
}

const config = resolveConfig({
	namespace: 'rsvp.atmo',
	logger: { log() {}, warn() {}, error() {} },
	collections: {
		event: {
			collection: 'community.lexicon.calendar.event',
			queryable: { name: {} },
			searchable: ['name']
		}
	}
});

const event: IngestEvent = {
	uri: 'at://did:plc:alice/community.lexicon.calendar.event/one',
	did: 'did:plc:alice',
	collection: 'community.lexicon.calendar.event',
	rkey: 'one',
	operation: 'create',
	cid: 'bafy-event',
	record: JSON.stringify({ name: 'Indexed meetup' }),
	time_us: 1,
	indexed_at: 1
};

describe('Contrail D1 FTS indexing backport', () => {
	it('maintains FTS rows through the indexed URI map, never a virtual-table URI scan', async () => {
		const { db, batches } = recordingDb();

		await applyEvents(db, [event], config, {
			skipReplayDetection: true,
			skipFeedFanout: true
		});

		const sql = batches.flat().map((statement) => statement.sql);
		expect(sql).toContain(
			'INSERT INTO fts_event_rows (uri) VALUES (?) ON CONFLICT(uri) DO NOTHING'
		);
		expect(sql).toContain(
			'DELETE FROM fts_event WHERE rowid = (SELECT id FROM fts_event_rows WHERE uri = ?)'
		);
		expect(sql).toContain(
			'INSERT INTO fts_event (rowid, content) SELECT id, ? FROM fts_event_rows WHERE uri = ?'
		);
		expect(sql).not.toContain('DELETE FROM fts_event WHERE uri = ?');
	});

	it('migrates the deployed uri-bearing FTS table before accepting the new schema', async () => {
		const { db, batches } = recordingDb({ legacyFts: true });

		await initSchema(db, config);

		const migrationSql = batches.flat().map((statement) => statement.sql);
		expect(migrationSql).toContain('DROP TABLE IF EXISTS fts_event');
		expect(migrationSql).toContain('DROP TABLE IF EXISTS fts_event_rows');
		expect(
			migrationSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS fts_event_rows'))
		).toBe(true);
		expect(migrationSql).toContain(
			'CREATE VIRTUAL TABLE IF NOT EXISTS fts_event USING fts5(content)'
		);
		expect(migrationSql.some((sql) => sql.startsWith('INSERT INTO fts_event_rows (uri)'))).toBe(
			true
		);
		expect(
			migrationSql.some((sql) => sql.startsWith('INSERT INTO fts_event (rowid, content)'))
		).toBe(true);
	});

	it('uses the ordinary URI index to join search results back to records', () => {
		expect(buildFtsTables(config, sqliteDialect)).toEqual([
			expect.stringContaining('uri TEXT NOT NULL UNIQUE'),
			'CREATE VIRTUAL TABLE IF NOT EXISTS fts_event USING fts5(content)'
		]);
		expect(ftsQueryClause(sqliteDialect, 'records_event').join).toBe(
			'JOIN fts_event_rows fts_rows ON fts_rows.uri = r.uri JOIN fts_event fts ON fts.rowid = fts_rows.id'
		);
	});
});
