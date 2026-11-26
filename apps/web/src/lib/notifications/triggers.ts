import type { Client } from '@atcute/client';
import type { Did, ResourceUri } from '@atcute/lexicons';
import type { Notify, SqlDatabase } from '@atmo-dev/notify';
import { getProfileBlobUrl, getProfileFromContrail, getRsvpStatus } from '#lib/contrail.js';
import { EVENT } from './feed';
import { enrolledAmong } from './watched';

export type Jobs = {
	/** Contrail's rebuildable projection: read only. */
	db: SqlDatabase;
	/** Notification storage. */
	stable: SqlDatabase;
	notify: Notify<string>;
	client: Client;
	now: number;
};

const REMINDER_LEAD = 15 * 60_000;
const PAGE = 200;
const GOING = 'community.lexicon.calendar.rsvp#going';
const INTERESTED = 'community.lexicon.calendar.rsvp#interested';

export function parseEventUri(uri: unknown) {
	const match = typeof uri === 'string' ? /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(uri) : null;
	return match && match[2] === EVENT ? { did: match[1] as Did, rkey: match[3]! } : null;
}

/** Content always comes through the public API so moderation decides what is visible. */
async function loadEvent(client: Client, uri: string) {
	const response = await client.get('rsvp.atmo.event.getRecord', {
		params: { uri: uri as ResourceUri }
	});
	if (response.ok) return response.data;
	if (response.status === 404 || response.data.error === 'RecordNotFound') return null;
	throw new Error('Could not load event for notifications');
}

const inactive = (status?: string) =>
	!!status && (status.endsWith('#cancelled') || status.endsWith('#postponed'));

/** One page of the people responding to an event, optionally with its host. */
async function audience(db: SqlDatabase, uri: string, after: string, host?: string) {
	const { results } = await db
		.prepare(
			`SELECT ? AS did WHERE ? > ?
			 UNION
			 SELECT did FROM records_rsvp WHERE json_extract(record, '$.subject.uri') = ?
			 AND json_extract(record, '$.status') IN (?, ?) AND did > ?
			 ORDER BY did LIMIT ?`
		)
		// An empty host never sorts after the cursor, so it adds nobody.
		.bind(host ?? '', host ?? '', after, uri, GOING, INTERESTED, after, PAGE + 1)
		.all<{ did: string }>();
	const page = results.slice(0, PAGE);
	return {
		dids: page.map((row) => row.did),
		next: results.length > PAGE ? page.at(-1)!.did : null
	};
}

/**
 * Loads watched events whose record changed (or that were just added) and
 * compares the fields worth a notification. The first sighting is a baseline.
 */
export async function checkEvents({ stable, client, now }: Jobs) {
	const { results } = await stable
		.prepare(
			`UPDATE rsvp_watched_events SET checked_at = ? WHERE uri IN (
			   SELECT uri FROM rsvp_watched_events WHERE dirty != 0 ORDER BY checked_at LIMIT 25
			 ) RETURNING uri, snapshot`
		)
		.bind(now)
		.all<{ uri: string; snapshot: string | null }>();
	let failed = 0;
	for (const row of results) {
		try {
			const event = await loadEvent(client, row.uri);
			if (!event?.value) {
				// Deleted or hidden is not proof of cancellation: keep the last snapshot.
				await stable
					.prepare('UPDATE rsvp_watched_events SET dirty = 0 WHERE uri = ?')
					.bind(row.uri)
					.run();
				continue;
			}
			const value = event.value;
			const snapshot = JSON.stringify({
				name: value.name,
				startsAt: value.startsAt,
				endsAt: value.endsAt,
				locations: value.locations,
				uris: value.uris,
				mode: value.mode,
				status: value.status
			});
			const starts = Date.parse(value.startsAt ?? '');
			const changed = row.snapshot !== null && row.snapshot !== snapshot;
			await stable
				.prepare(
					`UPDATE rsvp_watched_events SET dirty = 0, snapshot = ?, starts_at = ?,
					 change_key = CASE WHEN ? THEN ? ELSE change_key END,
					 change_after = CASE WHEN ? THEN '' ELSE change_after END WHERE uri = ?`
				)
				.bind(
					snapshot,
					Number.isNaN(starts) ? null : starts,
					changed ? 1 : 0,
					`change:${row.uri}:${event.cid}`,
					changed ? 1 : 0,
					row.uri
				)
				.run();
		} catch {
			failed++; // Still dirty; least recently tried goes first next tick.
		}
	}
	return failed;
}

/** Tells an event's attendees, not its host, about a meaningful change. */
export async function sendChanges({ db, stable, notify, now }: Jobs) {
	const { results } = await stable
		.prepare(
			`UPDATE rsvp_watched_events SET checked_at = ? WHERE uri IN (
			   SELECT uri FROM rsvp_watched_events WHERE change_key IS NOT NULL
			   ORDER BY checked_at LIMIT 10
			 ) RETURNING uri, snapshot, change_key, change_after`
		)
		.bind(now)
		.all<{ uri: string; snapshot: string; change_key: string; change_after: string }>();
	let failed = 0;
	for (const row of results) {
		try {
			const event = parseEventUri(row.uri)!;
			const { dids, next } = await audience(db, row.uri, row.change_after);
			const { name, status } = JSON.parse(row.snapshot) as { name?: string; status?: string };
			const title = (name || 'Event').slice(0, 150);
			const cancelled = status?.endsWith('#cancelled');
			await notify.sendMany(
				dids
					.filter((did) => did !== event.did)
					.map((recipient) => ({
						recipient,
						category: 'change',
						subject: row.uri,
						uri: `/p/${event.did}/e/${event.rkey}`,
						key: row.change_key,
						title: cancelled ? `${title} was cancelled` : `${title} changed`,
						body: cancelled ? undefined : 'Check the latest event details.'
					}))
			);
			// A newer change replaces the key and restarts the audience.
			await stable
				.prepare(
					`UPDATE rsvp_watched_events SET change_after = ?,
					 change_key = CASE WHEN ? THEN change_key END WHERE uri = ? AND change_key = ?`
				)
				.bind(next ?? '', next === null ? 0 : 1, row.uri, row.change_key)
				.run();
		} catch {
			failed++;
		}
	}
	return failed;
}

/** Reminds hosts and attendees in the last 15 minutes before a watched event. */
export async function sendReminders({ db, stable, notify, client, now }: Jobs) {
	const { results } = await stable
		.prepare(
			`SELECT uri, starts_at, reminded_start, remind_after FROM rsvp_watched_events
			 WHERE starts_at > ? AND starts_at <= ?
			 AND (reminded_start IS NOT starts_at OR remind_after IS NOT NULL)
			 ORDER BY starts_at, uri LIMIT 25`
		)
		.bind(now, now + REMINDER_LEAD)
		.all<{
			uri: string;
			starts_at: number;
			reminded_start: number | null;
			remind_after: string | null;
		}>();
	let failed = 0;
	for (const row of results) {
		try {
			const event = parseEventUri(row.uri)!;
			const after = row.reminded_start === row.starts_at ? (row.remind_after ?? '') : '';
			const { dids, next } = await audience(db, row.uri, after, event.did);
			const enrolled = [...(await enrolledAmong(stable, dids))];
			let stop = false;
			if (enrolled.length > 0) {
				const value = (await loadEvent(client, row.uri))?.value;
				const starts = Date.parse(value?.startsAt ?? '');
				// A moved start is picked up by the change check; don't remind for the old one.
				stop = !value || inactive(value.status) || starts !== row.starts_at;
				if (!stop) {
					const title = (value!.name || 'Event').slice(0, 150);
					await notify.sendMany(
						enrolled.map((recipient) => ({
							recipient,
							category: 'reminder',
							subject: row.uri,
							uri: `/p/${event.did}/e/${event.rkey}`,
							key: `reminder:${row.uri}:${row.starts_at}`,
							// Not pushed once the event has started; the inbox keeps it.
							expiresAt: row.starts_at,
							title: `${title} starts soon`,
							body: 'Starting within 15 minutes.'
						}))
					);
				}
			}
			await stable
				.prepare(
					'UPDATE rsvp_watched_events SET reminded_start = ?, remind_after = ? WHERE uri = ? AND starts_at = ?'
				)
				.bind(row.starts_at, stop ? null : next, row.uri, row.starts_at)
				.run();
		} catch {
			failed++; // Progress is unchanged, so the same page is retried.
		}
	}
	return failed;
}

/** Tells hosts about queued positive responses, least recently tried first. */
export async function sendHostRsvps({ db, stable, notify, client, now }: Jobs) {
	const { results } = await stable
		.prepare(
			`UPDATE rsvp_pending_rsvps SET attempted_at = ? WHERE uri IN (
			   SELECT uri FROM rsvp_pending_rsvps ORDER BY attempted_at, uri LIMIT 30
			 ) RETURNING uri`
		)
		.bind(now)
		.all<{ uri: string }>();
	let failed = 0;
	for (const { uri } of results) {
		try {
			const row = await db
				.prepare(
					`SELECT did, json_extract(record, '$.subject.uri') AS subject,
					 json_extract(record, '$.status') AS status FROM records_rsvp WHERE uri = ?`
				)
				.bind(uri)
				.first<{ did: Did; subject: string; status: string }>();
			const event = parseEventUri(row?.subject);
			const status = getRsvpStatus(row?.status);
			if (
				row &&
				event &&
				row.did !== event.did &&
				(status === 'going' || status === 'interested')
			) {
				const record = await loadEvent(client, row.subject);
				// Also check the response is visible, including actor moderation.
				const visible = await client.get('rsvp.atmo.rsvp.listRecords', {
					params: { actor: row.did, subjectUri: row.subject, limit: 200 }
				});
				if (!visible.ok) throw new Error('Could not check RSVP visibility');
				if (
					record?.value &&
					visible.data.records.some((item) => item.uri === uri) &&
					Date.parse(record.value.endsAt || record.value.startsAt || '') > now &&
					!record.value.status?.endsWith('#cancelled')
				) {
					const profile = await getProfileFromContrail(client, row.did);
					const name = profile?.value?.displayName || profile?.handle || 'Someone';
					await notify.send({
						recipient: event.did,
						category: 'rsvp',
						subject: row.subject,
						uri: `/p/${event.did}/e/${event.rkey}`,
						// One per attendee and event, however many records they wrote.
						key: `rsvp:${row.subject}:${row.did}`,
						title: `${name.slice(0, 100)} is ${status}`,
						body: (record.value.name || 'Your event').slice(0, 500),
						actors: [
							{
								did: row.did,
								handle: profile?.handle,
								displayName: profile?.value?.displayName,
								avatar: getProfileBlobUrl(row.did, profile?.value?.avatar)
							}
						]
					});
				}
			}
			await stable.prepare('DELETE FROM rsvp_pending_rsvps WHERE uri = ?').bind(uri).run();
		} catch {
			failed++; // Kept for up to a week; later responses are not held up.
		}
	}
	return failed;
}
