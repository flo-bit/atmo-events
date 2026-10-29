import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@atcute/client';
import { Contrail, createIngestEvent, ingestRecords } from '@atmo-dev/contrail';
import { createSqliteDatabase } from '@atmo-dev/contrail/sqlite';
import { config } from '../contrail.config';
import { refreshCitySnapshot } from '../server/cities';
import { cityQuery } from './queries';
import { decodeCursor } from './cursor';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const collection = 'community.lexicon.calendar.event';
let db: ReturnType<typeof createSqliteDatabase>;
let client: Client;
beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
	db = createSqliteDatabase(':memory:');
	const contrail = new Contrail({ ...config, profiles: [] });
	await contrail.init(db);
	await ingestRecords(
		db,
		Array.from({ length: 45 }, (_, i) =>
			createIngestEvent({
				did,
				collection,
				rkey: `event-${i}`,
				cid: 'cid',
				operation: 'create',
				timeUs: i + 1,
				value: {
					$type: collection,
					name: `Event ${i}`,
					startsAt: '2099-01-01T00:00:00Z',
					createdAt: '2026-01-01T00:00:00Z',
					locations: [
						{ $type: 'community.lexicon.location.address', locality: 'Berlin', country: 'DE' }
					]
				}
			})
		),
		contrail.config
	);
	// The native adapter returns SQLite run results; the app's cron consumes D1's
	// meta.changes shape. Keep the real SQL and atomic batches underneath.
	const snapshotDb = {
		...db,
		prepare(sql: string) {
			function wrap(statement: ReturnType<typeof db.prepare>): ReturnType<typeof db.prepare> {
				return {
					...statement,
					bind: (...values: unknown[]) => wrap(statement.bind(...values)),
					run: async () => {
						const result = (await statement.run()) as { changes: number };
						return { meta: { changes: result.changes } };
					}
				};
			}
			return wrap(db.prepare(sql));
		}
	};
	await refreshCitySnapshot(snapshotDb as unknown as D1Database);
	const handle = contrail.handler({ db });
	client = new Client({
		handler: (path, init) => handle(new Request(new URL(path, 'http://localhost'), init))
	});
});
afterEach(() => vi.useRealTimers());
const scope = { city: 'berlin', country: 'de', region: '' };

describe('city snapshots with published Contrail', () => {
	it('walks the snapshot through the real pipeline without missing or duplicating records', async () => {
		const uris: string[] = [];
		let cursor: string | null = null;
		for (let page = 0; page < 3; page++) {
			const result = await cityQuery(client, scope, cursor, db);
			uris.push(...result.events.map(({ uri }) => uri));
			// cityQuery receives the native cursor from the shared envelope codec.
			cursor = result.cursor ? decodeCursor(result.cursor)!.raw : null;
		}
		expect(uris).toHaveLength(45);
		expect(new Set(uris).size).toBe(45);
		expect(cursor).toBeNull();
	});
	it('applies current record and account hides even to an existing snapshot', async () => {
		const first = await cityQuery(client, scope, null, db);
		const hidden = first.events[0].uri;
		await db
			.prepare("INSERT INTO moderation_hidden (subject, kind, cid) VALUES (?, 'record', '')")
			.bind(hidden)
			.run();
		const afterHide = await cityQuery(client, scope, null, db);
		expect(afterHide.events).toHaveLength(20);
		expect(afterHide.events.map(({ uri }) => uri)).not.toContain(hidden);
		await db
			.prepare("INSERT INTO moderation_hidden (subject, kind, cid) VALUES (?, 'account', '')")
			.bind(did)
			.run();
		expect((await cityQuery(client, scope, null, db)).events).toEqual([]);
	});
});
