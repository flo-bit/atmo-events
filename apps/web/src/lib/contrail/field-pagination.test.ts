import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
	queryRecords,
	resolveConfig,
	sqliteDialect,
	type Database,
	type Statement
} from '@atmo-dev/contrail-appview';
import { cityConditions, readTopCities, refreshCitySnapshot } from '#lib/server/cities.js';

// Regression found by walking all 657 Boulder events: the old keyset skipped
// one record at a page boundary when startsAt AND time_us were identical.
function setup() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(`CREATE TABLE records_event (
		uri TEXT PRIMARY KEY, did TEXT, rkey TEXT, cid TEXT, record TEXT,
		time_us INTEGER, indexed_at INTEGER
	)`);
	function prepare(sql: string, params: SQLInputValue[] = []): Statement {
		return {
			bind: (...values: unknown[]) => prepare(sql, values as SQLInputValue[]),
			all: async <T>() => ({ results: sqlite.prepare(sql).all(...params) as T[] }),
			first: async <T>() => (sqlite.prepare(sql).get(...params) as T) ?? null,
			run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } })
		};
	}
	const db: Database = {
		prepare,
		batch: async (statements) => {
			sqlite.exec('BEGIN');
			try {
				const results = [];
				for (const statement of statements) results.push(await statement.run());
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		},
		dialect: sqliteDialect
	};
	const config = resolveConfig({
		namespace: 'rsvp.atmo',
		collections: {
			event: {
				collection: 'community.lexicon.calendar.event',
				queryable: { startsAt: { type: 'range' } }
			}
		}
	});
	for (let i = 44; i >= 0; i--) {
		const rkey = String(i).padStart(3, '0');
		const record = {
			startsAt: `2050-01-${i < 40 ? '01' : '02'}T12:00:00.000Z`,
			locations: [
				{
					$type: 'community.lexicon.location.address',
					locality: i % 3 === 0 ? 'Boulder, Colorado, 80302' : 'Boulder',
					country: i % 2 ? 'US' : 'United States',
					region: i % 2 ? 'CO' : 'Colorado'
				}
			]
		};
		sqlite
			.prepare('INSERT INTO records_event VALUES (?, ?, ?, ?, ?, ?, ?)')
			.run(
				`at://did:plc:test/community.lexicon.calendar.event/${rkey}`,
				'did:plc:test',
				rkey,
				'cid',
				JSON.stringify(record),
				i % 7 ? 100 : 200,
				1
			);
	}
	return { sqlite, db, config };
}

describe('Contrail record-field keyset URI tie-breaker', () => {
	it.each(['asc', 'desc'] as const)(
		'walks every normalized city event exactly once with %s date order and tied ingestion times',
		async (direction) => {
			const { sqlite, db, config } = setup();
			try {
				const cities = await readTopCities(db, '2049-01-01T00:00:00.000Z');
				expect(cities).toEqual([{ city: 'Boulder', country: 'US', region: 'Colorado', count: 45 }]);
				await refreshCitySnapshot(
					db as unknown as D1Database,
					Date.parse('2049-01-01T00:00:00.000Z')
				);
				const source = await cityConditions(db, cities[0]);
				const actual: string[] = [];
				let cursor: string | undefined;
				for (let i = 0; i < 4; i++) {
					const page = await queryRecords(db, config, {
						collection: 'event',
						source,
						sort: { recordField: 'startsAt', direction },
						limit: 20,
						cursor
					});
					actual.push(...page.records.map((record) => record.uri));
					cursor = page.cursor;
					if (!cursor) break;
					const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
					expect(payload.u).toBe(page.records.at(-1)?.uri);
				}
				const expected = sqlite
					.prepare(
						`SELECT uri FROM records_event ORDER BY json_extract(record, '$.startsAt') ${direction}, time_us DESC, uri ASC`
					)
					.all()
					.map((row) => row.uri);
				expect(actual).toEqual(expected);
				expect(new Set(actual).size).toBe(cities[0].count);
				expect(cursor).toBeUndefined();
			} finally {
				sqlite.close();
			}
		}
	);

	it('still accepts an in-flight legacy field cursor without a URI', async () => {
		const { sqlite, db, config } = setup();
		try {
			const cursor = Buffer.from(
				JSON.stringify({ t: 200, v: '2050-01-01T12:00:00.000Z', k: 'field:startsAt' })
			).toString('base64url');
			const page = await queryRecords(db, config, {
				collection: 'event',
				sort: { recordField: 'startsAt', direction: 'asc' },
				limit: 100,
				cursor
			});
			expect(page.records.length).toBeGreaterThan(0);
			expect(page.records.length).toBeLessThan(45);
		} finally {
			sqlite.close();
		}
	});
});
