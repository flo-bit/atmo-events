import {
	MAX_NEW_RSVPS_PER_TICK,
	MAX_SENDS_PER_TICK,
	REMINDER_CATCHUP_MS,
	REMINDER_24H_MS,
	REMINDER_MILESTONES,
	type ReminderKind
} from './config';
import {
	claimNotification,
	countEnabledSubscribers,
	ensureNotifySchema,
	getHandles,
	getRsvpCursor,
	releaseNotification,
	setRsvpCursor,
	setSubscriber
} from './db';
import { notifyConfigured } from './keypair';
import { RelayError, relaySend, type SendPayload } from './relay';

type Env = App.Platform['env'];

// json_extract($.status) is the full token, e.g.
// `community.lexicon.calendar.rsvp#going`. Match the going/interested suffixes.
const ATTENDING_SQL = `(
	json_extract(r.record,'$.status') LIKE '%#going'
	OR json_extract(r.record,'$.status') LIKE '%#interested'
)`;

/** Entry point, called from the cron after firehose ingest. No-ops cleanly when
 *  notifications aren't configured (dev, or before the signing key is set). */
export async function runNotifications(env: Env, db: D1Database): Promise<void> {
	if (!notifyConfigured(env)) return;
	await ensureNotifySchema(db);

	let budget = MAX_SENDS_PER_TICK;
	// New-RSVP alerts must advance the cursor even when there are no subscribers,
	// so the backlog never grows; reminders are a pure no-op without subscribers.
	if ((await countEnabledSubscribers(db)) > 0) {
		budget = await processReminders(env, db, budget);
	}
	await processNewRsvps(env, db, budget);
}

type SendOutcome = 'sent' | 'ratelimited' | 'nogrant' | 'error';

/** Send, mapping relay errors to an outcome the callers act on. A 403 means the
 *  recipient has no active grant (revoked outside our webhook) → mark them
 *  disabled so we stop trying. */
async function trySend(env: Env, db: D1Database, payload: SendPayload): Promise<SendOutcome> {
	try {
		await relaySend(env, payload);
		return 'sent';
	} catch (e) {
		if (e instanceof RelayError) {
			if (e.status === 429) return 'ratelimited';
			if (e.status === 403) {
				await setSubscriber(db, payload.recipient, false);
				return 'nogrant';
			}
		}
		console.error('[notify] send failed:', e);
		return 'error';
	}
}

function eventWebUrl(env: Env, eventUri: string): string | undefined {
	// at://<did>/community.lexicon.calendar.event/<rkey>
	const m = eventUri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
	if (!m) return undefined;
	return `${env.OAUTH_PUBLIC_URL}/p/${m[1]}/e/${m[2]}`;
}

function reminderCopy(kind: ReminderKind, name: string): { title: string; body: string } {
	const ev = name || 'Your event';
	switch (kind) {
		case 'r24':
			return { title: 'Event tomorrow', body: `${ev} starts in 24 hours` };
		case 'r1':
			return { title: 'Event soon', body: `${ev} starts in 1 hour` };
		case 'r0':
			return { title: 'Starting now', body: `${ev} is starting now` };
	}
}

type ReminderRow = {
	recipient: string;
	event_uri: string;
	host: string;
	name: string | null;
	starts_at: string | null;
};

/**
 * Reminders (24h / 1h / at start) for events a subscriber is going to or
 * interested in. We fetch each subscriber's upcoming attending events (joined in
 * SQL so non-subscribers never enter the set), then fire whichever milestones
 * are currently due.
 */
async function processReminders(env: Env, db: D1Database, budget: number): Promise<number> {
	if (budget <= 0) return budget;
	const now = Date.now();

	// Candidate window on startsAt as ISO strings. Padded by 36h on each side so
	// non-UTC offsets (max ±14h) can't slip a relevant event past the string
	// comparison; precise filtering happens in JS via Date.parse below.
	const PAD = 36 * 60 * 60 * 1000;
	const lo = new Date(now - REMINDER_CATCHUP_MS - PAD).toISOString();
	const hi = new Date(now + REMINDER_24H_MS + PAD).toISOString();

	const { results } = await db
		.prepare(
			`SELECT r.did AS recipient,
				e.uri AS event_uri,
				e.did AS host,
				json_extract(e.record,'$.name')     AS name,
				json_extract(e.record,'$.startsAt')  AS starts_at
			FROM records_rsvp r
			JOIN records_event e ON json_extract(r.record,'$.subject.uri') = e.uri
			JOIN notify_subscribers s ON s.did = r.did AND s.enabled = 1
			WHERE json_extract(e.record,'$.startsAt') >= ?
				AND json_extract(e.record,'$.startsAt') <= ?
				AND ${ATTENDING_SQL}`
		)
		.bind(lo, hi)
		.all<ReminderRow>();

	const hostHandles = await getHandles(
		db,
		results.map((r) => r.host)
	);

	for (const row of results) {
		if (!row.starts_at) continue;
		const startMs = Date.parse(row.starts_at);
		if (!Number.isFinite(startMs)) continue;
		const url = eventWebUrl(env, row.event_uri);
		const hostHandle = hostHandles.get(row.host);

		for (const m of REMINDER_MILESTONES) {
			if (budget <= 0) return budget;
			const fireAt = startMs - m.offsetMs;
			// Due if we're within [fireAt, fireAt + catchup]. Past events (startMs
			// far behind) and far-future ones fall outside every milestone window.
			if (now < fireAt || now > fireAt + REMINDER_CATCHUP_MS) continue;

			const key = `${m.kind}:${row.recipient}:${row.event_uri}`;
			if (!(await claimNotification(db, key, row.recipient, m.kind))) continue;

			const { title, body } = reminderCopy(m.kind, row.name ?? '');
			const outcome = await trySend(env, db, {
				recipient: row.recipient,
				title,
				body,
				uri: url,
				category: 'reminder',
				categoryDescription: 'Event reminders',
				threadKey: row.event_uri,
				actors: hostHandle ? [hostHandle] : undefined
			});

			if (outcome === 'ratelimited') {
				await releaseNotification(db, key);
				return 0; // stop this tick; pick up next minute
			}
			budget--;
		}
	}

	return budget;
}

type NewRsvpRow = {
	rsvp_uri: string;
	rsvp_author: string;
	indexed_at: number;
	status: string | null;
	event_uri: string;
	host: string;
	name: string | null;
};

/**
 * Host alerts: notify an event's owner when someone (else) RSVPs going/interested
 * to it. Walks RSVPs indexed since our cursor; only events whose owner is an
 * enabled subscriber are joined in. The cursor advances every tick so the
 * backlog stays bounded; on first run it's seeded to "now" to avoid replaying
 * history.
 */
async function processNewRsvps(env: Env, db: D1Database, budget: number): Promise<void> {
	let cursor = await getRsvpCursor(db);
	if (cursor === null) {
		const row = await db
			.prepare(`SELECT MAX(indexed_at) AS m FROM records_rsvp`)
			.first<{ m: number | null }>();
		cursor = Number(row?.m) || Date.now() * 1000;
		await setRsvpCursor(db, cursor);
		return; // baseline only — don't alert on pre-existing RSVPs
	}
	if (budget <= 0) return;

	const { results } = await db
		.prepare(
			`SELECT r.uri AS rsvp_uri,
				r.did AS rsvp_author,
				r.indexed_at AS indexed_at,
				json_extract(r.record,'$.status') AS status,
				e.uri AS event_uri,
				e.did AS host,
				json_extract(e.record,'$.name') AS name
			FROM records_rsvp r
			JOIN records_event e ON json_extract(r.record,'$.subject.uri') = e.uri
			JOIN notify_subscribers s ON s.did = e.did AND s.enabled = 1
			WHERE r.indexed_at > ?
				AND r.did <> e.did
				AND ${ATTENDING_SQL}
			ORDER BY r.indexed_at ASC
			LIMIT ?`
		)
		.bind(cursor, MAX_NEW_RSVPS_PER_TICK)
		.all<NewRsvpRow>();

	if (results.length === 0) return;

	const authorHandles = await getHandles(
		db,
		results.map((r) => r.rsvp_author)
	);

	let advanceTo = cursor;
	for (const row of results) {
		if (budget <= 0) break; // leave cursor before this row; retry next tick

		const key = `rsvp:${row.rsvp_uri}`;
		if (await claimNotification(db, key, row.host, 'rsvp')) {
			const who = authorHandles.get(row.rsvp_author) ?? row.rsvp_author;
			const verb = row.status?.endsWith('#interested') ? 'is interested in' : 'is going to';
			const outcome = await trySend(env, db, {
				recipient: row.host,
				title: 'New RSVP',
				body: `${who} ${verb} ${row.name || 'your event'}`,
				uri: eventWebUrl(env, row.event_uri),
				category: 'rsvp',
				categoryDescription: 'RSVPs to your events',
				threadKey: row.event_uri,
				actors: [row.rsvp_author]
			});

			if (outcome === 'ratelimited') {
				await releaseNotification(db, key);
				break; // leave cursor before this row
			}
			budget--;
		}

		advanceTo = Number(row.indexed_at);
	}

	if (advanceTo > cursor) await setRsvpCursor(db, advanceTo);
}
