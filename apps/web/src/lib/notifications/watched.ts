import type { SqlDatabase, SqlStatement } from '@atmo-dev/notify';

/**
 * App-owned notification state, kept beside the library's `notify_*` tables.
 *
 * `rsvp_watched_events` holds only events an enrolled account hosts or responded
 * to, so reminders and change checks never scan the network-wide projection.
 */
const schema = [
	`CREATE TABLE IF NOT EXISTS rsvp_watched_events (
  uri TEXT PRIMARY KEY,
  starts_at INTEGER,
  snapshot TEXT,
  dirty INTEGER NOT NULL DEFAULT 1,
  checked_at INTEGER NOT NULL DEFAULT 0,
  change_key TEXT,
  change_after TEXT,
  reminded_start INTEGER,
  remind_after TEXT,
  created_at INTEGER NOT NULL
)`,
	`CREATE INDEX IF NOT EXISTS rsvp_watched_start ON rsvp_watched_events (starts_at)`,
	`CREATE INDEX IF NOT EXISTS rsvp_watched_dirty ON rsvp_watched_events (checked_at) WHERE dirty != 0`,
	`CREATE INDEX IF NOT EXISTS rsvp_watched_change
  ON rsvp_watched_events (checked_at) WHERE change_key IS NOT NULL`,
	`CREATE TABLE IF NOT EXISTS rsvp_pending_rsvps (
  uri TEXT PRIMARY KEY,
  attempted_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`,
	`CREATE INDEX IF NOT EXISTS rsvp_pending_attempt ON rsvp_pending_rsvps (attempted_at)`,
	// Lets the cron find newly enrolled accounts without scanning every user.
	`CREATE INDEX IF NOT EXISTS rsvp_users_created ON notify_users (created_at, did)`
];

/** Run after the library's own `setup()`: the last index is on its users table. */
export async function setupNotificationState(db: SqlDatabase) {
	await db.batch(schema.map((sql) => db.prepare(sql)));
}

const CHUNK = 500;

/** `WHERE x IN (SELECT value FROM json_each(?))` keeps large lists to one bound parameter. */
export function chunks<T>(values: T[], size = CHUNK): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
	return out;
}

export async function batched(db: SqlDatabase, statements: SqlStatement[]) {
	for (const chunk of chunks(statements, 50)) await db.batch(chunk);
}

export async function enrolledAmong(stable: SqlDatabase, dids: string[]) {
	const found = new Set<string>();
	for (const chunk of chunks([...new Set(dids)])) {
		const { results } = await stable
			.prepare('SELECT did FROM notify_users WHERE did IN (SELECT value FROM json_each(?))')
			.bind(JSON.stringify(chunk))
			.all<{ did: string }>();
		for (const row of results) found.add(row.did);
	}
	return found;
}

export async function watch(stable: SqlDatabase, uris: string[], now: number) {
	await batched(
		stable,
		[...new Set(uris)].map((uri) =>
			stable
				.prepare(
					'INSERT INTO rsvp_watched_events (uri, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING'
				)
				.bind(uri, now)
		)
	);
}

const DAY = 86_400_000;

/** Events stay eligible for late changes for a week after they start. */
export async function pruneNotificationState(stable: SqlDatabase, now = Date.now()) {
	await stable.batch([
		stable.prepare('DELETE FROM rsvp_watched_events WHERE starts_at < ?').bind(now - 7 * DAY),
		stable
			.prepare('DELETE FROM rsvp_watched_events WHERE starts_at IS NULL AND created_at < ?')
			.bind(now - 90 * DAY),
		stable.prepare('DELETE FROM rsvp_pending_rsvps WHERE created_at < ?').bind(now - 7 * DAY)
	]);
}
