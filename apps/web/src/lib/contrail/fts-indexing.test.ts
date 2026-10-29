import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteDatabase } from '@atmo-dev/contrail/sqlite';
import { initSchema, resolveConfig, createIngestEvent, ingestRecords } from '@atmo-dev/contrail';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const collection = 'community.lexicon.calendar.event';
const config = resolveConfig({
	namespace: 'rsvp.atmo',
	profiles: [],
	collections: { event: { collection, queryable: { name: {} }, searchable: ['name'] } },
	moderation: { moderators: [], reports: false }
});

describe('patched 0.12 projection migration', () => {
	it('preserves records, cursor and app state, then maintains FTS by indexed rowid', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'rsvp-migration-'));
		const path = join(dir, 'projection.sqlite');
		try {
			const raw = new DatabaseSync(path);
			raw.exec(readFileSync(new URL('./fixtures/legacy-0.12.sql', import.meta.url), 'utf8'));
			raw.close();
			const db = createSqliteDatabase(path);
			await initSchema(db, config);
			await initSchema(db, config); // idempotent, no cursor reset
			expect(
				await db.prepare('SELECT value FROM bot_state WHERE key = ?').bind('cursor').first()
			).toEqual({ value: 'keep-me' });
			expect(await db.prepare('SELECT time_us FROM cursor WHERE id = 1').first()).toEqual({
				time_us: 1000000
			});
			expect(await db.prepare('SELECT COUNT(*) AS count FROM records_event').first()).toEqual({
				count: 1
			});
			expect(
				(await db.prepare('SELECT * FROM fts_event WHERE content MATCH ?').bind('Jazz').all())
					.results
			).toHaveLength(1);
			await ingestRecords(
				db,
				[
					createIngestEvent({
						did,
						collection,
						rkey: 'one',
						operation: 'update',
						cid: 'newcid',
						timeUs: 2000000,
						value: { name: 'Tech meetup', startsAt: '2099-01-01T12:00:00Z' }
					})
				],
				config
			);
			expect(
				(await db.prepare('SELECT * FROM fts_event WHERE content MATCH ?').bind('Jazz').all())
					.results
			).toHaveLength(0);
			expect(
				(await db.prepare('SELECT * FROM fts_event WHERE content MATCH ?').bind('Tech').all())
					.results
			).toHaveLength(1);
			await ingestRecords(
				db,
				[createIngestEvent({ did, collection, rkey: 'one', operation: 'delete', timeUs: 3000000 })],
				config
			);
			expect((await db.prepare('SELECT * FROM fts_event').all()).results).toHaveLength(0);
			expect((await db.prepare('SELECT * FROM fts_event_rows').all()).results).toHaveLength(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
