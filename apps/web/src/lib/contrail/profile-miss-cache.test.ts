import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	initSchema,
	resolveConfig,
	resolveProfiles,
	sqliteDialect,
	type Database,
	type Statement
} from '@atmo-dev/contrail-appview';

// Authors without an app.bsky.actor.profile record (OpenMeet, self-hosted PDSes)
// used to cost a live PDS round-trip on EVERY profile-hydrating read, because a
// RecordNotFound was never remembered. These pin the negative cache that fixed it.

const HOUR_MS = 60 * 60 * 1000;
const PDS = 'https://pds.example';
const DID = 'did:plc:noprofile';

function sqliteDb(): Database {
	const raw = new DatabaseSync(':memory:');
	const prepare = (sql: string): Statement => {
		let params: SQLInputValue[] = [];
		const statement: Statement = {
			bind(...values: SQLInputValue[]) {
				params = values;
				return statement;
			},
			async run() {
				return raw.prepare(sql).run(...params);
			},
			async all<T>() {
				return { results: raw.prepare(sql).all(...params) as T[] };
			},
			async first<T>() {
				return (raw.prepare(sql).get(...params) ?? null) as T | null;
			}
		};
		return statement;
	};
	return {
		prepare,
		async batch(statements) {
			raw.exec('BEGIN');
			try {
				for (const statement of statements) await statement.run();
				raw.exec('COMMIT');
			} catch (e) {
				raw.exec('ROLLBACK');
				throw e;
			}
			return [];
		},
		dialect: sqliteDialect
	};
}

const config = resolveConfig({
	namespace: 'rsvp.atmo',
	logger: { log() {}, warn() {}, error() {} },
	collections: { event: { collection: 'community.lexicon.calendar.event' } }
});

function pdsResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

const notFound = () =>
	pdsResponse(400, { error: 'RecordNotFound', message: 'Could not locate record' });

let db: Database;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
	db = sqliteDb();
	await initSchema(db, config);
	await db
		.prepare('INSERT INTO identities (did, handle, pds, resolved_at) VALUES (?, ?, ?, ?)')
		.bind(DID, 'noprofile.example', PDS, Date.now())
		.run();
	fetchMock = vi.fn(async () => notFound());
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('profile hydration negative cache', () => {
	it('asks the PDS for a missing profile once, not on every read', async () => {
		const first = await resolveProfiles(db, config, [DID]);
		const second = await resolveProfiles(db, config, [DID]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first[DID]).toEqual([{ did: DID, handle: 'noprofile.example' }]);
		expect(second[DID]).toEqual([{ did: DID, handle: 'noprofile.example' }]);
	});

	it('re-checks a not-found profile after a day', async () => {
		await resolveProfiles(db, config, [DID]);
		vi.setSystemTime(Date.now() + 23 * HOUR_MS);
		await resolveProfiles(db, config, [DID]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 2 * HOUR_MS);
		await resolveProfiles(db, config, [DID]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries an unreachable PDS within the hour, not the day', async () => {
		fetchMock.mockImplementation(async () => {
			throw new TypeError('fetch failed');
		});
		await resolveProfiles(db, config, [DID]);
		await resolveProfiles(db, config, [DID]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + HOUR_MS + 1);
		await resolveProfiles(db, config, [DID]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('serves a profile that is ingested while a miss is still cached', async () => {
		await resolveProfiles(db, config, [DID]);
		await db
			.prepare(
				'INSERT INTO records_profile (uri, did, rkey, cid, record, time_us, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(
				`at://${DID}/app.bsky.actor.profile/self`,
				DID,
				'self',
				'bafy-profile',
				JSON.stringify({ displayName: 'Now Has A Profile' }),
				1,
				1
			)
			.run();

		const profiles = await resolveProfiles(db, config, [DID]);

		expect(profiles[DID]?.[0]?.value).toEqual({ displayName: 'Now Has A Profile' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('stores a profile the PDS does have and serves it from D1 afterwards', async () => {
		fetchMock.mockImplementation(async () =>
			pdsResponse(200, {
				uri: `at://${DID}/app.bsky.actor.profile/self`,
				cid: 'bafy-profile',
				value: { displayName: 'Fetched' }
			})
		);

		const first = await resolveProfiles(db, config, [DID]);
		const second = await resolveProfiles(db, config, [DID]);

		expect(first[DID]?.[0]?.value).toEqual({ displayName: 'Fetched' });
		expect(second[DID]?.[0]?.value).toEqual({ displayName: 'Fetched' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
