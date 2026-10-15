// Test-only binding adapters. Production modules never import this file.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function testDb() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(readFileSync('scripts/og-cache-schema.sql', 'utf8'));
	function prepare(sql: string, params: unknown[] = []): D1PreparedStatement {
		return {
			bind: (...values: unknown[]) => prepare(sql, values),
			run: async () => execute(sql, params),
			all: async () => execute(sql, params),
			first: async () => sqlite.prepare(sql).get(...(params as never[]))
		} as unknown as D1PreparedStatement;
	}
	function execute(sql: string, params: unknown[]) {
		const statement = sqlite.prepare(sql);
		const results = statement.columns().length ? statement.all(...(params as never[])) : [];
		const changes = statement.columns().length
			? 0
			: Number(statement.run(...(params as never[])).changes);
		return { success: true, results, meta: { changes } } as D1Result;
	}
	// Keep statements' SQL/bindings visible to the transaction executor.
	const bound = new WeakMap<D1PreparedStatement, { sql: string; params: unknown[] }>();
	function trackedPrepare(sql: string, params: unknown[] = []): D1PreparedStatement {
		const statement = prepare(sql, params);
		statement.bind = (...values: unknown[]) => trackedPrepare(sql, values);
		bound.set(statement, { sql, params });
		return statement;
	}
	const db = {
		prepare: trackedPrepare,
		batch: async (statements: D1PreparedStatement[]) => {
			sqlite.exec('BEGIN');
			try {
				const result = statements.map((statement) => {
					const { sql, params } = bound.get(statement)!;
					return execute(sql, params);
				});
				sqlite.exec('COMMIT');
				return result;
			} catch (cause) {
				sqlite.exec('ROLLBACK');
				throw cause;
			}
		}
	} as unknown as D1Database;
	return { db, sqlite };
}

export function testBucket(objects = new Map<string, ArrayBuffer>()) {
	const bucket = {
		get: async (key: string) => {
			const bytes = objects.get(key);
			return bytes
				? {
						size: bytes.byteLength,
						body: new Response(bytes).body!,
						arrayBuffer: async () => bytes.slice(0)
					}
				: null;
		},
		put: async (key: string, bytes: ArrayBuffer) => {
			objects.set(key, bytes.slice(0));
			return {};
		}
	} as unknown as R2Bucket;
	return { bucket, objects };
}

export const tinyPng = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
	),
	(char) => char.charCodeAt(0)
).buffer;
