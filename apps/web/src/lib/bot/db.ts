import type { BotOutcome } from './config';
import { NO_EVENT_COOLDOWN_MS, NO_TOKEN_COOLDOWN_MS } from './config';

/**
 * Records every mention the bot has acted on. Doubles as the dedup guard (so a
 * mention is never processed twice across overlapping cron ticks) and the
 * cooldown source (so we don't repeatedly nag the same person).
 */
let schemaReady = false;

export async function ensureBotSchema(db: D1Database): Promise<void> {
	if (schemaReady) return;
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS rsvp_bot_processed (
				notif_uri  TEXT PRIMARY KEY,
				author_did TEXT NOT NULL,
				outcome    TEXT NOT NULL,
				event_uri  TEXT,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_rsvp_bot_author
				ON rsvp_bot_processed (author_did, created_at)`
		)
	]);
	schemaReady = true;
}

/** Returns the subset of `uris` already processed (so we skip them). */
export async function getProcessed(db: D1Database, uris: string[]): Promise<Set<string>> {
	if (uris.length === 0) return new Set();
	const placeholders = uris.map(() => '?').join(',');
	const { results } = await db
		.prepare(`SELECT notif_uri FROM rsvp_bot_processed WHERE notif_uri IN (${placeholders})`)
		.bind(...uris)
		.all<{ notif_uri: string }>();
	return new Set(results.map((r) => r.notif_uri));
}

export async function recordOutcome(
	db: D1Database,
	input: { notifUri: string; authorDid: string; outcome: BotOutcome; eventUri?: string | null }
): Promise<void> {
	await db
		.prepare(
			`INSERT OR REPLACE INTO rsvp_bot_processed
				(notif_uri, author_did, outcome, event_uri, created_at)
				VALUES (?, ?, ?, ?, ?)`
		)
		.bind(input.notifUri, input.authorDid, input.outcome, input.eventUri ?? null, Date.now())
		.run();
}

async function repliedWithin(
	db: D1Database,
	authorDid: string,
	outcome: BotOutcome,
	windowMs: number
): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT 1 FROM rsvp_bot_processed
				WHERE author_did = ? AND outcome = ? AND created_at > ?
				LIMIT 1`
		)
		.bind(authorDid, outcome, Date.now() - windowMs)
		.first();
	return row !== null;
}

/** True if we've already told this person to sign in within the cooldown window. */
export function repliedNoTokenRecently(db: D1Database, authorDid: string): Promise<boolean> {
	return repliedWithin(db, authorDid, 'replied_no_token', NO_TOKEN_COOLDOWN_MS);
}

/** True if we've already said "no event here" to this person within the window. */
export function repliedNoEventRecently(db: D1Database, authorDid: string): Promise<boolean> {
	return repliedWithin(db, authorDid, 'replied_no_event', NO_EVENT_COOLDOWN_MS);
}
