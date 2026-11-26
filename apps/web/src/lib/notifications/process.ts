import type { Did } from '@atcute/lexicons';
import { getRsvpStatus } from '#lib/contrail.js';
import { EVENT, RSVP, readFeed, type FeedRow } from './feed';
import {
	checkEvents,
	parseEventUri,
	sendChanges,
	sendHostRsvps,
	sendReminders,
	type Jobs
} from './triggers';
import { batched, chunks, enrolledAmong, watch } from './watched';

export { pruneNotificationState } from './watched';

const DAY = 86_400_000;
const GOING = 'community.lexicon.calendar.rsvp#going';
const INTERESTED = 'community.lexicon.calendar.rsvp#interested';

export type NotificationRun = Jobs & {
	/** Contrail projection generation; a new one restarts the feed from now. */
	epoch?: string | null;
	/** Sources that carry live changes, as opposed to backfills. */
	sources?: string[];
};

/**
 * One cron tick: read what changed in the projection, note what matters to an
 * enrolled account, then send. Work follows the number of changed records and
 * watched events, never the number of accounts or events on the network.
 */
export async function processNotifications(run: NotificationRun) {
	const { db, notify, now } = run;
	await seedNewAccounts(run);

	const feed = await readFeed({
		db,
		notify,
		now,
		epoch: run.epoch ?? null,
		sources: run.sources ?? ['jetstream', 'pds-notify'],
		// Longer than an ingest drain, so rows stamped before a slow commit are not skipped.
		lag: 45_000
	});
	await applyFeed(run, feed.rows);
	// Effects are idempotent, so a crash before this only replays the rows.
	await feed.commit();

	let failed = 0;
	for (const job of [checkEvents, sendChanges, sendReminders, sendHostRsvps]) {
		try {
			failed += await job(run);
		} catch (error) {
			failed++;
			console.error('[notifications] job failed:', error);
		}
	}
	return { rows: feed.rows.length, failed };
}

async function applyFeed({ db, stable, now }: Jobs, rows: FeedRow[]) {
	const of = (collection: string, ...operations: string[]) =>
		rows
			.filter((row) => row.collection === collection && operations.includes(row.operation))
			.map((row) => row.uri);

	// Only rows for events somebody here cares about match; the rest cost nothing.
	for (const chunk of chunks(of(EVENT, 'update'))) {
		await stable
			.prepare(
				'UPDATE rsvp_watched_events SET dirty = 1 WHERE uri IN (SELECT value FROM json_each(?))'
			)
			.bind(JSON.stringify(chunk))
			.run();
	}
	// A deleted event is removed quietly: it is not a cancellation.
	for (const chunk of chunks(of(EVENT, 'delete'))) {
		await stable
			.prepare('DELETE FROM rsvp_watched_events WHERE uri IN (SELECT value FROM json_each(?))')
			.bind(JSON.stringify(chunk))
			.run();
	}

	const rsvps: Array<{ uri: string; did: string; host: Did; subject: string }> = [];
	for (const chunk of chunks(of(RSVP, 'create', 'update'))) {
		const { results } = await db
			.prepare(
				`SELECT uri, did, json_extract(record, '$.subject.uri') AS subject,
				 json_extract(record, '$.status') AS status FROM records_rsvp
				 WHERE uri IN (SELECT value FROM json_each(?))`
			)
			.bind(JSON.stringify(chunk))
			.all<{ uri: string; did: string; subject: string; status: string }>();
		for (const row of results) {
			const event = parseEventUri(row.subject);
			const status = getRsvpStatus(row.status);
			if (event && (status === 'going' || status === 'interested')) {
				rsvps.push({ uri: row.uri, did: row.did, host: event.did, subject: row.subject });
			}
		}
	}
	if (rsvps.length === 0) return;
	const enrolled = await enrolledAmong(
		stable,
		rsvps.flatMap((row) => [row.did, row.host])
	);
	const forHost = rsvps.filter((row) => row.did !== row.host && enrolled.has(row.host));
	await watch(
		stable,
		rsvps
			.filter((row) => enrolled.has(row.did) || enrolled.has(row.host))
			.map((row) => row.subject),
		now
	);
	await batched(
		stable,
		forHost.map((row) =>
			stable
				.prepare(
					'INSERT INTO rsvp_pending_rsvps (uri, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING'
				)
				.bind(row.uri, now)
		)
	);
}

/**
 * Starts watching what a newly enrolled account already attends or hosts, a few
 * accounts per tick. Hosted events count only once somebody has responded;
 * `count_rsvp` is Contrail's maintained relation count, so this is one index
 * range over the account's own events.
 */
async function seedNewAccounts({ db, stable, notify, now }: Jobs) {
	const key = 'rsvp:seed';
	const cursor: [number, string] = JSON.parse((await notify.peek(key)) ?? '[0, ""]');
	const { results } = await stable
		.prepare(
			`SELECT did, created_at FROM notify_users WHERE (created_at, did) > (?, ?)
			 ORDER BY created_at, did LIMIT 5`
		)
		.bind(...cursor)
		.all<{ did: string; created_at: number }>();
	// Starts in other time zones sort within a day of their UTC form.
	const since = new Date(now - DAY).toISOString();
	for (const user of results) {
		const { results: events } = await db
			.prepare(
				`SELECT e.uri FROM records_rsvp r
				 JOIN records_event e ON e.uri = json_extract(r.record, '$.subject.uri')
				 WHERE r.did = ? AND json_extract(r.record, '$.status') IN (?, ?)
				 AND json_extract(e.record, '$.startsAt') >= ?
				 UNION
				 SELECT e.uri FROM records_event e WHERE e.did = ?
				 AND e.count_rsvp > 0 AND json_extract(e.record, '$.startsAt') >= ?`
			)
			.bind(user.did, GOING, INTERESTED, since, user.did, since)
			.all<{ uri: string }>();
		await watch(
			stable,
			events.map((event) => event.uri),
			now
		);
		await notify.track(key, JSON.stringify([user.created_at, user.did]));
	}
}
