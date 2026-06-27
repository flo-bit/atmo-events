// Single source of truth for "is this event discoverable?". Used by BOTH the SQL
// read paths (contrail.config.ts pipelineQueries and the external geocode
// worklist) AND the in-memory sink filter (meili-sink.ts). The two MUST agree on
// semantics or the search index and the hydrated read path drift: an event the
// sink indexes but D1 hides (or the reverse) becomes a phantom, present in Meili
// yet dropped at hydration, or missing from search yet listed by D1.
//
// The rule: preferences.showInDiscovery hides the event when it is FALSEY in the
// JSON sense (boolean false OR numeric 0, since SQLite stores JSON false as 0). A
// missing/null/true value, any nonzero number, or any string stays discoverable,
// so pre-existing records without `preferences` are included by default. The SQL
// form uses `!= 0`; the JS form mirrors it with `=== false || === 0` (JS treats
// 0.0 as 0, matching SQLite). Parity across the full value surface is locked by
// discoverability.test.ts against real-SQLite ground truth.

const PREF_PATH = '$.preferences.showInDiscovery';

/** SQL predicate (true = discoverable) over a record column expression, e.g.
 *  `discoverableSql('r.record')`. The one definition both the contrail
 *  pipelineQueries and the geocode worklist import, so the two SQL sites cannot
 *  drift from each other or from the JS mirror below. */
export function discoverableSql(recordCol: string): string {
	return `(json_extract(${recordCol}, '${PREF_PATH}') IS NULL
		OR json_extract(${recordCol}, '${PREF_PATH}') != 0)`;
}

/** In-memory mirror of discoverableSql for the sink: true when the author hid the
 *  event from discovery. Hides on a falsey showInDiscovery (boolean false OR
 *  numeric 0, including 0.0) to match SQLite's `!= 0`; missing/null/true/1/strings
 *  stay discoverable. Tolerates a null or non-object record/preferences. */
export function isHiddenFromDiscovery(record: Record<string, unknown>): boolean {
	const prefs = record?.preferences as { showInDiscovery?: unknown } | null | undefined;
	const v = prefs?.showInDiscovery;
	return v === false || v === 0;
}
