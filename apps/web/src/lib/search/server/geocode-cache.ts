// Pure decision logic for the geocode_cache worklist: the row shape, the
// negative-cache retry/backoff policy, and grouping worklist events by their
// normalized address. No I/O — the job feeds rows in and acts on the verdicts.
import { normalizeAddress, addressLocation } from './address-norm';
import { recordGeo } from './normalize';

export interface GeocodeCacheRow {
	address_norm: string;
	lat: number | null;
	lng: number | null;
	precision: string | null;
	source: string | null;
	geocoded_at: number; // epoch ms
	fail_count: number;
	last_error: string | null;
}

export interface WorklistEvent {
	uri: string;
	did: string;
	rkey: string;
	loc: Record<string, unknown>;
}

const DAY = 86_400_000;
/** No more automatic attempts once fail_count reaches this (~4 tries / ~5 wks). */
export const MAX_FAIL = 4;

/** No-match backoff: eligible again after 1d (fail 1), 7d (2), 30d (3+). */
export function backoffMs(failCount: number): number {
	if (failCount <= 1) return DAY;
	if (failCount === 2) return 7 * DAY;
	return 30 * DAY;
}

/** Is this address work this run? Absent → yes. Resolved → no. Negative →
 *  retryable iff fail_count < MAX_FAIL and the backoff elapsed (or forced). */
export function isEligible(
	row: GeocodeCacheRow | undefined,
	now: number,
	retryNegative = false
): boolean {
	if (!row) return true;
	if (row.lat !== null && row.lng !== null) return false; // resolved, done
	if (retryNegative) return true;
	if (row.fail_count >= MAX_FAIL) return false;
	return now - row.geocoded_at >= backoffMs(row.fail_count);
}

/** The address location to geocode for a record, or null when there's nothing
 *  to do. Returns null if the record ALREADY resolves to coordinates the index
 *  derives (recordGeo: geo/fsq/hthree, in-range) — geocoding it would overwrite
 *  precise coords with approximate ones — and null if it carries no address at
 *  all. So an event with an address plus an out-of-range geo/hthree location
 *  (recordGeo undefined) correctly still gets its address geocoded. This is the
 *  in-memory worklist filter that keeps "needs geocoding" aligned with the
 *  sink's _geo derivation, since the SQL worklist can only coarsely pre-filter. */
export function addressNeedingGeocode(
	record: Record<string, unknown>
): Record<string, unknown> | null {
	if (recordGeo(record)) return null;
	return addressLocation(record);
}

/** Bucket worklist events by their normalized address; events that don't
 *  normalize to a key (e.g. empty address) are dropped. */
export function groupEventsByNorm(events: WorklistEvent[]): Map<string, WorklistEvent[]> {
	const map = new Map<string, WorklistEvent[]>();
	for (const e of events) {
		const norm = normalizeAddress(e.loc);
		if (!norm) continue;
		let arr = map.get(norm);
		if (!arr) {
			arr = [];
			map.set(norm, arr);
		}
		arr.push(e);
	}
	return map;
}
