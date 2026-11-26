import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@atcute/client';
import { createNotify } from '@atmo-dev/notify';
import { sqliteDatabase as createSqliteDatabase } from '@atmo-dev/notify/sqlite';
import { processNotifications, pruneNotificationState } from './process';
import { setupNotificationState } from './watched';

const now = Date.parse('2026-11-11T12:00:00Z');
const MINUTE = 60_000;
const EVENT = 'community.lexicon.calendar.event';
const RSVP = 'community.lexicon.calendar.rsvp';
const host = 'did:plc:host';
const guest = 'did:plc:guest';
const stranger = 'did:plc:stranger';
const eventUri = (owner = host, rkey = 'walk') => `at://${owner}/${EVENT}/${rkey}`;
const uri = eventUri();
let db: ReturnType<typeof createSqliteDatabase>;
let stable: ReturnType<typeof createSqliteDatabase>;
let notify: ReturnType<typeof createNotify>;
let client: Client;
let clock: number;
let epoch: string;
let hidden: boolean;
let failingEvent: string | null;
let failingRsvp: string | null;

/** Writes the projection row and its version, as Contrail's ingest would. */
function version(recordUri: string, collection: string, operation: string, source: string) {
	return db
		.prepare('INSERT OR REPLACE INTO record_versions VALUES (?, ?, ?, ?, ?)')
		.bind(recordUri, collection, operation, source, clock * 1000);
}
async function event(
	patch: Record<string, unknown> = {},
	options: { owner?: string; rkey?: string; cid?: string; source?: string } = {}
) {
	const { owner = host, rkey = 'walk', source = 'jetstream' } = options;
	const target = eventUri(owner, rkey);
	const existing = await db
		.prepare('SELECT 1 FROM records_event WHERE uri = ?')
		.bind(target)
		.first();
	await db.batch([
		db
			.prepare(
				`INSERT INTO records_event (uri, did, rkey, cid, record) VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (uri) DO UPDATE SET cid = excluded.cid, record = excluded.record`
			)
			.bind(
				target,
				owner,
				rkey,
				options.cid ?? `cid-${clock}-${JSON.stringify(patch).length}`,
				JSON.stringify({
					name: 'Evening walk',
					startsAt: new Date(now + 10 * MINUTE).toISOString(),
					status: `${EVENT}#scheduled`,
					...patch
				})
			),
		version(target, EVENT, existing ? 'update' : 'create', source)
	]);
}
async function rsvp(
	did = guest,
	status = 'going',
	options: { rkey?: string; event?: string; source?: string } = {}
) {
	const target = `at://${did}/${RSVP}/${options.rkey ?? 'rsvp'}`;
	const existing = await db
		.prepare('SELECT 1 FROM records_rsvp WHERE uri = ?')
		.bind(target)
		.first();
	await db.batch([
		db.prepare('INSERT OR REPLACE INTO records_rsvp VALUES (?, ?, ?)').bind(
			target,
			did,
			JSON.stringify({
				// Editing a response keeps its original creation time.
				createdAt: '2026-11-01T00:00:00Z',
				status: `${RSVP}#${status}`,
				subject: { uri: options.event ?? uri, cid: 'v1' }
			})
		),
		version(target, RSVP, existing ? 'update' : 'create', options.source ?? 'jetstream'),
		// Contrail maintains this count as responses are indexed.
		db
			.prepare(
				"UPDATE records_event SET count_rsvp = (SELECT count(*) FROM records_rsvp WHERE json_extract(record, '$.subject.uri') = records_event.uri) WHERE uri = ?"
			)
			.bind(options.event ?? uri)
	]);
}
const history = { source: 'pds-backfill' };
const run = () => processNotifications({ db, stable, notify, client, now: clock, epoch });
/** Rows written since the last tick become visible once they are 45 seconds old. */
const tick = (minutes = 1) => {
	clock += minutes * MINUTE;
	return run();
};
const inbox = async (did = guest, category?: string) =>
	(await notify.list(did, { limit: 100 })).items.filter(
		(item) => !category || item.category === category
	);
const watched = async () =>
	(
		await stable.prepare('SELECT uri FROM rsvp_watched_events ORDER BY uri').all<{ uri: string }>()
	).results.map((row) => row.uri);

beforeEach(async () => {
	clock = now;
	epoch = 'g1';
	db = createSqliteDatabase(':memory:');
	stable = createSqliteDatabase(':memory:');
	notify = createNotify({
		db: stable,
		audience: 'enrolled',
		now: () => clock,
		categories: {
			reminder: { title: 'Reminders' },
			change: { title: 'Changes' },
			rsvp: { title: 'RSVPs' }
		}
	});
	await notify.setup();
	await setupNotificationState(stable);
	await db.batch([
		db.prepare(
			'CREATE TABLE records_event (uri TEXT PRIMARY KEY, did TEXT, rkey TEXT, cid TEXT, record TEXT, count_rsvp INTEGER DEFAULT 0)'
		),
		db.prepare('CREATE TABLE records_rsvp (uri TEXT PRIMARY KEY, did TEXT, record TEXT)'),
		db.prepare(
			'CREATE TABLE record_versions (uri TEXT PRIMARY KEY, collection TEXT, operation TEXT, source_id TEXT, indexed_at INTEGER)'
		)
	]);
	// Before anyone enrolled: a backfilled event with one response.
	await event({}, history);
	await rsvp(guest, 'going', history);
	await notify.enroll(guest);
	await notify.enroll(host);
	hidden = false;
	failingEvent = null;
	failingRsvp = null;
	client = {
		get: vi.fn(async (method, { params }) => {
			if (method === 'rsvp.atmo.event.getRecord') {
				if (params.uri === failingEvent)
					return { ok: false, status: 503, data: { error: 'Unavailable' } };
				const row = await db
					.prepare('SELECT * FROM records_event WHERE uri = ?')
					.bind(params.uri)
					.first<{ uri: string; cid: string; record: string }>();
				return row && !hidden
					? { ok: true, data: { ...row, value: JSON.parse(row.record) } }
					: { ok: false, status: 404, data: { error: 'RecordNotFound' } };
			}
			if (method === 'rsvp.atmo.rsvp.listRecords') {
				if (params.actor === failingRsvp)
					return { ok: false, status: 503, data: { error: 'Unavailable' } };
				const { results } = await db
					.prepare(
						"SELECT uri FROM records_rsvp WHERE did = ? AND json_extract(record, '$.subject.uri') = ?"
					)
					.bind(params.actor, params.subjectUri)
					.all();
				return { ok: true, data: { records: hidden ? [] : results } };
			}
			if (method === 'rsvp.atmo.getProfile')
				return {
					ok: true,
					data: {
						profiles: [{ did: params.actor, handle: 'mira.test', value: { displayName: 'Mira' } }]
					}
				};
			throw new Error(method);
		})
	} as unknown as Client;
});

afterEach(() => {
	db.close();
	stable.close();
});

describe('reminders', () => {
	it('are sent only in the final 15 minutes, once, and expire at the start', async () => {
		const start = now + 16.5 * MINUTE;
		await event({ startsAt: new Date(start).toISOString() }, history);
		await run();
		await tick();
		expect(await inbox(guest, 'reminder')).toHaveLength(0);
		await tick();
		expect(await inbox(guest, 'reminder')).toMatchObject([
			{ subject: uri, body: 'Starting within 15 minutes.', expiresAt: start }
		]);
		await tick(20);
		expect(await inbox(guest, 'reminder')).toHaveLength(1);
	});

	it('reach the host and enrolled attendees, not strangers, without historical RSVP alerts', async () => {
		await rsvp(stranger, 'going', history);
		await run();
		await tick();
		expect(await inbox()).toMatchObject([{ category: 'reminder', subject: uri }]);
		expect(await inbox(host)).toMatchObject([{ category: 'reminder', subject: uri }]);
		expect(await inbox(stranger)).toEqual([]);
	});

	it('do no further work for a finished audience until the start moves', async () => {
		await run();
		vi.mocked(client.get).mockClear();
		await tick();
		expect(client.get).not.toHaveBeenCalled();
		await event({ startsAt: new Date(now + 12 * MINUTE).toISOString() });
		await tick();
		expect((await inbox()).map((item) => item.category).sort()).toEqual([
			'change',
			'reminder',
			'reminder'
		]);
	});

	it('handle starts written with a UTC offset and many attendees in one tick', async () => {
		for (let i = 0; i < 80; i++) {
			await rsvp(`did:plc:a${i}`, 'going', history);
			await notify.enroll(`did:plc:a${i}`);
		}
		await event({ startsAt: '2026-11-11T13:30:00+01:00' }, history); // 12:30 UTC
		// Seeding takes five new accounts per tick; the event itself is already watched.
		for (let i = 0; i < 17; i++) await tick();
		expect(await inbox('did:plc:a79', 'reminder')).toMatchObject([
			{ expiresAt: Date.parse('2026-11-11T12:30:00Z') }
		]);
		expect(await inbox('did:plc:a0', 'reminder')).toHaveLength(1);
	});

	it('page a large audience without holding up another due event', async () => {
		const other = eventUri(host, 'other');
		await event(
			{ startsAt: new Date(now + 11 * MINUTE).toISOString() },
			{ rkey: 'other', ...history }
		);
		await rsvp(guest, 'going', { rkey: 'other', event: other, ...history });
		for (let i = 0; i < 205; i++) await rsvp(`did:plc:a${i}`, 'going', history);
		await notify.enroll('did:plc:a99'); // Sorts after the first 200 attendees.
		await run();
		expect(await inbox('did:plc:a99')).toEqual([]);
		expect((await inbox(host)).some((item) => item.subject === other)).toBe(true);
		await tick();
		expect(await inbox('did:plc:a99')).toMatchObject([{ category: 'reminder', subject: uri }]);
	});

	it('start for an event an enrolled account responds to later', async () => {
		const later = eventUri(stranger, 'later');
		await event({}, { owner: stranger, rkey: 'later', ...history });
		await run();
		expect(await watched()).toEqual([uri]);
		await rsvp(guest, 'interested', { rkey: 'later', event: later });
		await tick();
		expect(await watched()).toEqual([uri, later].sort());
		expect((await inbox(guest, 'reminder')).map((item) => item.subject).sort()).toEqual(
			[uri, later].sort()
		);
	});
});

describe('event changes', () => {
	it('notify attendees, not the host, about meaningful edits and cancellations', async () => {
		await run();
		await event({ description: 'A new paragraph' });
		await tick();
		expect(await inbox(guest, 'change')).toHaveLength(0);
		await event({ name: 'Morning walk' });
		await tick();
		await tick();
		expect(await inbox(guest, 'change')).toMatchObject([{ title: 'Morning walk changed' }]);
		await event({ name: 'Morning walk', status: `${EVENT}#cancelled` });
		await tick();
		expect((await inbox(guest, 'change'))[0]).toMatchObject({
			title: 'Morning walk was cancelled'
		});
		expect(await inbox(host, 'change')).toHaveLength(0);
	});

	it('respect a category that is off, without replaying on re-enable', async () => {
		await run();
		await notify.setPreference(guest, 'change', 'off');
		await event({ name: 'Changed' });
		await tick();
		await notify.setPreference(guest, 'change', null);
		await tick();
		expect(await inbox(guest, 'change')).toHaveLength(0);
	});

	it('are not inferred from a deleted or hidden event', async () => {
		await run();
		hidden = true;
		await event({ name: 'Hidden edit' });
		await tick();
		hidden = false;
		await db.prepare('DELETE FROM records_event WHERE uri = ?').bind(uri).run();
		await version(uri, EVENT, 'delete', 'jetstream').run();
		await tick();
		expect(await inbox(guest, 'change')).toHaveLength(0);
		expect(await watched()).toEqual([]);
	});

	it('are retried after a failed read without holding up other events', async () => {
		const other = eventUri(host, 'other');
		await event({ startsAt: '2026-12-01T10:00:00Z' }, { rkey: 'other', ...history });
		await rsvp(guest, 'going', { rkey: 'other', event: other, ...history });
		await run();
		await event({ name: 'A different walk' });
		await event({ name: 'Another', startsAt: '2026-12-01T10:00:00Z' }, { rkey: 'other' });
		failingEvent = uri;
		expect(await tick()).toMatchObject({ failed: 1 });
		expect(await inbox(guest, 'change')).toMatchObject([{ subject: other }]);
		failingEvent = null;
		expect(await tick()).toMatchObject({ failed: 0 });
		expect(await inbox(guest, 'change')).toHaveLength(2);
	});

	it('reach an account that enrolled after responding, from the first change on', async () => {
		await rsvp(stranger, 'going', history);
		await run();
		await notify.enroll(stranger);
		await tick();
		await event({ name: 'Renamed' });
		await tick();
		expect(await inbox(stranger, 'change')).toHaveLength(1);
	});
});

describe('host RSVPs', () => {
	it('notify hosts of new positive responses, not their own, duplicates or declines', async () => {
		await run();
		await rsvp(stranger, 'going', { rkey: 'new' });
		await rsvp(host, 'going', { rkey: 'own' });
		await rsvp('did:plc:no', 'notgoing', { rkey: 'no' });
		await tick();
		await rsvp(stranger, 'interested', { rkey: 'again' });
		await tick();
		const items = await inbox(host, 'rsvp');
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ title: 'Mira is going', actors: [{ did: stranger }] });
	});

	it('count an edited response and ignore backfilled ones', async () => {
		await rsvp(stranger, 'notgoing', history);
		await run();
		await rsvp(stranger, 'going'); // Same record and createdAt, new status.
		await rsvp('did:plc:old', 'going', history);
		await tick();
		const items = await inbox(host, 'rsvp');
		expect(items).toHaveLength(1);
		expect(items[0]?.actors[0]?.did).toBe(stranger);
	});

	it('keep a failed response retryable without holding up later ones', async () => {
		await run();
		await rsvp(stranger, 'going');
		await rsvp('did:plc:zed', 'going');
		failingRsvp = stranger;
		expect(await tick()).toMatchObject({ failed: 1 });
		expect(await inbox(host, 'rsvp')).toMatchObject([{ actors: [{ did: 'did:plc:zed' }] }]);
		failingRsvp = null;
		await tick();
		expect(await inbox(host, 'rsvp')).toHaveLength(2);
	});

	it('are sent in order across ticks when many arrive at once', async () => {
		await run();
		for (let i = 0; i < 55; i++) await rsvp(`did:plc:guest${i}`, 'going');
		await tick();
		expect(await inbox(host, 'rsvp')).toHaveLength(30);
		await tick();
		expect(await inbox(host, 'rsvp')).toHaveLength(55);
	});
});

describe('feed', () => {
	it('discards a bulk import without storing or loading anything', async () => {
		await run();
		const importer = 'did:plc:importer';
		for (let i = 0; i < 2500; i += 250) {
			await db.batch(
				Array.from({ length: 250 }, (_, n) =>
					version(eventUri(importer, `e${i + n}`), EVENT, 'create', 'jetstream')
				)
			);
		}
		// Responses between accounts that do not use the app.
		for (let i = 0; i < 20; i++) {
			await rsvp(`did:plc:x${i}`, 'going', { event: eventUri(importer, `e${i}`) });
		}
		vi.mocked(client.get).mockClear();
		expect(await tick()).toEqual({ rows: 20, failed: 0 });
		expect(client.get).not.toHaveBeenCalled();
		expect(await watched()).toEqual([uri]);
		expect(await stable.prepare('SELECT count(*) AS n FROM rsvp_pending_rsvps').first()).toEqual({
			n: 0
		});
	});

	it('restarts from now when the projection is rebuilt', async () => {
		await run();
		epoch = 'g2';
		// A rebuild that re-indexes old records through a live source.
		await rsvp(stranger, 'going');
		await event({ name: 'Replayed' });
		await tick();
		await tick();
		expect(await inbox(host, 'rsvp')).toHaveLength(0);
		expect(await inbox(guest, 'change')).toHaveLength(0);
		await rsvp('did:plc:fresh', 'going');
		await tick();
		expect(await inbox(host, 'rsvp')).toHaveLength(1);
	});

	it('does not watch a host’s events that nobody responded to', async () => {
		const importer = 'did:plc:importer';
		for (let i = 0; i < 30; i++) await event({}, { owner: importer, rkey: `e${i}`, ...history });
		await notify.enroll(importer);
		await run();
		expect(await watched()).toEqual([uri]);
		await rsvp(stranger, 'going', { event: eventUri(importer, 'e3') });
		await tick();
		expect(await watched()).toEqual([uri, eventUri(importer, 'e3')].sort());
		expect(await inbox(importer, 'rsvp')).toHaveLength(1);
	});

	it('prunes events a week after they start and abandoned retries', async () => {
		await run();
		await stable
			.prepare('INSERT INTO rsvp_pending_rsvps (uri, created_at) VALUES (?, ?)')
			.bind('at://old', now - 8 * 86_400_000)
			.run();
		await pruneNotificationState(stable, now + 6 * 86_400_000);
		expect(await watched()).toEqual([uri]);
		await pruneNotificationState(stable, now + 8 * 86_400_000);
		expect(await watched()).toEqual([]);
		expect(await stable.prepare('SELECT count(*) AS n FROM rsvp_pending_rsvps').first()).toEqual({
			n: 0
		});
	});
});
