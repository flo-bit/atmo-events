import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { discoverableSql } from './discoverability';

// SQLite maps JSON false to zero; strings, null and absent preferences remain
// discoverable. Exercise the actual SQL used by public event pipelines.
const PARITY: { label: string; record: Record<string, unknown>; sqlVisible: boolean }[] = [
	{ label: 'true', record: { preferences: { showInDiscovery: true } }, sqlVisible: true },
	{ label: 'false', record: { preferences: { showInDiscovery: false } }, sqlVisible: false },
	{ label: 'numeric 0', record: { preferences: { showInDiscovery: 0 } }, sqlVisible: false },
	{ label: 'float 0.0', record: { preferences: { showInDiscovery: 0.0 } }, sqlVisible: false },
	{ label: 'numeric 1', record: { preferences: { showInDiscovery: 1 } }, sqlVisible: true },
	{ label: 'explicit null', record: { preferences: { showInDiscovery: null } }, sqlVisible: true },
	{
		label: 'string "false"',
		record: { preferences: { showInDiscovery: 'false' } },
		sqlVisible: true
	},
	{ label: 'string "0"', record: { preferences: { showInDiscovery: '0' } }, sqlVisible: true },
	{ label: 'field absent', record: { preferences: {} }, sqlVisible: true },
	{ label: 'preferences absent', record: {}, sqlVisible: true }
];

describe('discovery preferences in SQLite', () => {
	it.each([
		...PARITY,
		{ label: 'null preferences', record: { preferences: null }, sqlVisible: true }
	])('$label', ({ record, sqlVisible }) => {
		const db = new DatabaseSync(':memory:');
		try {
			const result = db
				.prepare(`SELECT ${discoverableSql('r.record')} AS visible FROM (SELECT ? AS record) r`)
				.get(JSON.stringify(record));
			expect(Boolean(result!.visible)).toBe(sqlVisible);
		} finally {
			db.close();
		}
	});
});

describe('discoverableSql', () => {
	it('emits the != 0 predicate over the given record column', () => {
		const sql = discoverableSql('r.record');
		expect(sql).toContain("json_extract(r.record, '$.preferences.showInDiscovery')");
		expect(sql).toContain('IS NULL');
		expect(sql).toContain('!= 0');
	});

	it('parameterizes the column so different table aliases reuse one rule', () => {
		expect(discoverableSql('x.record')).toContain('json_extract(x.record');
	});
});
