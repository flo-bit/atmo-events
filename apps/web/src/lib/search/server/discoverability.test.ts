import { describe, it, expect } from 'vitest';
import { discoverableSql, isHiddenFromDiscovery } from './discoverability';

// The single rule both the SQL read paths (contrail.config.ts pipelineQueries,
// the geocode worklist) and the in-memory sink filter (meili-sink.ts) must agree
// on. If they drift, the index and the hydrated read path diverge: the sink
// indexes an event D1 hides (or vice-versa), creating a phantom doc.
//
// `sqlVisible` is the ground-truth verdict of the shared SQL predicate
//   json_extract(...,'$.preferences.showInDiscovery') IS NULL OR != 0
// evaluated against REAL SQLite (node:sqlite). Each row was confirmed by running
// the exact predicate over the JSON value; the table encodes those results so the
// parity check stays inside the Worker-typed test env (no node:sqlite/@types/node
// import here). SQLite maps JSON false→0 and true→1 and passes numbers through, so
// `!= 0` hides BOTH boolean false AND numeric 0 (and 0.0); strings, null, true,
// and missing all stay visible.
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

describe('isHiddenFromDiscovery', () => {
	for (const { label, record, sqlVisible } of PARITY) {
		it(`mirrors the SQL verdict for showInDiscovery=${label}`, () => {
			expect(isHiddenFromDiscovery(record)).toBe(!sqlVisible);
		});
	}

	it('tolerates a null/non-object record without throwing', () => {
		expect(isHiddenFromDiscovery(null as unknown as Record<string, unknown>)).toBe(false);
		expect(isHiddenFromDiscovery({ preferences: null } as unknown as Record<string, unknown>)).toBe(
			false
		);
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
