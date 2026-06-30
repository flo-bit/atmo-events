// D1 state for the geocode drip's cadence gate. A tiny single-purpose key/value
// table so geocode_cache stays purely address rows. The job's own geocode_cache
// table is created/self-healed by the shared core (runGeocodeJob).

/** Row key for the drip's last-run timestamp (epoch ms). */
const LAST_DRIP_KEY = 'last_drip_at';

export async function ensureGeocodeDripSchema(db: D1Database): Promise<void> {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS geocode_drip_state (
				key TEXT PRIMARY KEY,
				value INTEGER NOT NULL
			)`
		)
		.run();
}

/** Atomically claim the drip's cadence slot for `now`. A single conditional
 *  upsert: insert the first-ever timestamp, or advance it ONLY when a full
 *  `intervalMs` has elapsed since the stored one. Returns true iff THIS call won
 *  the slot (it wrote a row) — so two cron ticks racing inside the same interval
 *  can't both proceed, unlike the old read-then-write gate (a window where both
 *  read the stale timestamp before either wrote). Relies on D1 reporting
 *  meta.changes (1 = claimed, 0 = gated out by the WHERE on DO UPDATE). */
export async function claimDripSlot(
	db: D1Database,
	now: number,
	intervalMs: number
): Promise<boolean> {
	const res = await db
		.prepare(
			`INSERT INTO geocode_drip_state (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value
			 WHERE excluded.value - geocode_drip_state.value >= ?`
		)
		.bind(LAST_DRIP_KEY, now, intervalMs)
		.run();
	return (res.meta?.changes ?? 0) > 0;
}
