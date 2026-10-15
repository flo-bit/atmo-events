export interface OgBudgetEnv {
	DB: D1Database;
	OG_DAILY_GENERATION_LIMIT?: string;
	OG_CYCLE_GENERATION_LIMIT?: string;
	OG_BILLING_CYCLE_START_DAY?: string;
}

// Longer than an ordinary request's rendering time. Crashed/failed generations
// retain the lease for a cooldown; successful generations release it after PUT.
export const LEASE_MS = 10 * 60 * 1000;

function limit(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
}

export function budgetPeriods(now: number, startDay: number) {
	const date = new Date(now);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const cycleMonth = date.getUTCDate() < startDay ? month - 1 : month;
	return {
		day: date.toISOString().slice(0, 10),
		cycle: new Date(Date.UTC(year, cycleMonth, startDay)).toISOString().slice(0, 10)
	};
}

/**
 * D1 batch() is transactional and rolls back on error. The quota update and
 * lease acquisition are one atomic operation, across ALL isolates/hostnames.
 * A denied attempt writes neither a quota row nor a new per-image lease.
 * Counters are monotonically perioded: a delayed old request cannot reset them.
 */
export async function claimGeneration(env: OgBudgetEnv, key: string, now = Date.now()) {
	const dailyLimit = limit(env.OG_DAILY_GENERATION_LIMIT, 20);
	const cycleLimit = limit(env.OG_CYCLE_GENERATION_LIMIT, 300);
	const startDay = limit(env.OG_BILLING_CYCLE_START_DAY, 13);
	if (!dailyLimit || !cycleLimit || startDay < 1 || startDay > 28) return null;
	const { day, cycle } = budgetPeriods(now, startDay);
	const token = crypto.randomUUID();
	const results = await env.DB.batch([
		env.DB.prepare(
			`
			UPDATE og_generation_budget
			SET day = ?, cycle = ?,
				daily_attempts = CASE WHEN day < ? THEN 1 ELSE daily_attempts + 1 END,
				cycle_attempts = CASE WHEN cycle < ? THEN 1 ELSE cycle_attempts + 1 END,
				last_token = ?
			WHERE id = 1 AND day <= ? AND cycle <= ?
				AND (day < ? OR daily_attempts < ?)
				AND (cycle < ? OR cycle_attempts < ?)
				AND NOT EXISTS (
					SELECT 1 FROM og_generation_leases WHERE image_key = ? AND expires_at > ?
				)
		`
		).bind(day, cycle, day, cycle, token, day, cycle, day, dailyLimit, cycle, cycleLimit, key, now),
		env.DB.prepare(
			`
			INSERT INTO og_generation_leases (image_key, token, expires_at)
			SELECT ?, ?, ? FROM og_generation_budget WHERE id = 1 AND last_token = ?
			ON CONFLICT (image_key) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
		`
		).bind(key, token, now + LEASE_MS, token)
	]);
	if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) return null;
	return token;
}

export async function releaseGeneration(db: D1Database, key: string, token: string) {
	await db
		.prepare('DELETE FROM og_generation_leases WHERE image_key = ? AND token = ?')
		.bind(key, token)
		.run();
}

/** Only run after admission, not on every public request. Expiry is indexed. */
export async function pruneExpiredLeases(db: D1Database) {
	await db.prepare('DELETE FROM og_generation_leases WHERE expires_at <= ?').bind(Date.now()).run();
}
