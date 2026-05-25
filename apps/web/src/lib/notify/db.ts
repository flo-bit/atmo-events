// D1 tables backing atmo.pub notifications. Created lazily on first use (same
// pattern as the reply bot's schema in $lib/bot/db.ts), so no migration step.

let schemaReady = false;

export async function ensureNotifySchema(db: D1Database): Promise<void> {
	if (schemaReady) return;
	await db.batch([
		// Who has granted us permission to notify them. Kept authoritative by the
		// `subscriberChanged` webhook + the in-app enable/disable flow.
		db.prepare(
			`CREATE TABLE IF NOT EXISTS notify_subscribers (
				did        TEXT PRIMARY KEY,
				enabled    INTEGER NOT NULL DEFAULT 1,
				changed_at INTEGER NOT NULL
			)`
		),
		// Dedup ledger: one row per notification we've already sent (or claimed).
		// Prevents duplicates across overlapping cron ticks.
		db.prepare(
			`CREATE TABLE IF NOT EXISTS notify_sent (
				key        TEXT PRIMARY KEY,
				recipient  TEXT NOT NULL,
				kind       TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_notify_sent_created ON notify_sent (created_at)`),
		// Single-row cursor tracking the last RSVP we've considered for host
		// alerts (records_rsvp.indexed_at is in microseconds).
		db.prepare(
			`CREATE TABLE IF NOT EXISTS notify_state (
				id             INTEGER PRIMARY KEY CHECK (id = 1),
				rsvp_cursor_us INTEGER NOT NULL
			)`
		)
	]);
	schemaReady = true;
}

export async function setSubscriber(db: D1Database, did: string, enabled: boolean): Promise<void> {
	await db
		.prepare(
			`INSERT INTO notify_subscribers (did, enabled, changed_at)
				VALUES (?, ?, ?)
				ON CONFLICT(did) DO UPDATE SET enabled = excluded.enabled, changed_at = excluded.changed_at`
		)
		.bind(did, enabled ? 1 : 0, Date.now())
		.run();
}

export async function getSubscriber(
	db: D1Database,
	did: string
): Promise<{ enabled: boolean } | null> {
	const row = await db
		.prepare(`SELECT enabled FROM notify_subscribers WHERE did = ?`)
		.bind(did)
		.first<{ enabled: number }>();
	return row ? { enabled: row.enabled === 1 } : null;
}

export async function countEnabledSubscribers(db: D1Database): Promise<number> {
	const row = await db
		.prepare(`SELECT COUNT(*) AS n FROM notify_subscribers WHERE enabled = 1`)
		.first<{ n: number }>();
	return Number(row?.n ?? 0);
}

/**
 * Atomically claim a notification key. Returns true if this caller won the claim
 * (and should send), false if it was already claimed. Insert-or-ignore makes
 * this safe under concurrent/overlapping ticks.
 */
export async function claimNotification(
	db: D1Database,
	key: string,
	recipient: string,
	kind: string
): Promise<boolean> {
	const res = await db
		.prepare(
			`INSERT OR IGNORE INTO notify_sent (key, recipient, kind, created_at) VALUES (?, ?, ?, ?)`
		)
		.bind(key, recipient, kind, Date.now())
		.run();
	return (res.meta?.changes ?? 0) > 0;
}

/** Release a previously-claimed key so it can be retried (e.g. after a 429). */
export async function releaseNotification(db: D1Database, key: string): Promise<void> {
	await db.prepare(`DELETE FROM notify_sent WHERE key = ?`).bind(key).run();
}

export async function getRsvpCursor(db: D1Database): Promise<number | null> {
	const row = await db
		.prepare(`SELECT rsvp_cursor_us FROM notify_state WHERE id = 1`)
		.first<{ rsvp_cursor_us: number }>();
	return row ? Number(row.rsvp_cursor_us) : null;
}

export async function setRsvpCursor(db: D1Database, us: number): Promise<void> {
	await db
		.prepare(
			`INSERT INTO notify_state (id, rsvp_cursor_us) VALUES (1, ?)
				ON CONFLICT(id) DO UPDATE SET rsvp_cursor_us = excluded.rsvp_cursor_us`
		)
		.bind(us)
		.run();
}

/** Resolve DIDs to handles from contrail's `identities` index (best-effort). */
export async function getHandles(db: D1Database, dids: string[]): Promise<Map<string, string>> {
	const unique = [...new Set(dids)];
	if (unique.length === 0) return new Map();
	const placeholders = unique.map(() => '?').join(',');
	const { results } = await db
		.prepare(`SELECT did, handle FROM identities WHERE did IN (${placeholders})`)
		.bind(...unique)
		.all<{ did: string; handle: string | null }>();
	const map = new Map<string, string>();
	for (const r of results) if (r.handle) map.set(r.did, r.handle);
	return map;
}
