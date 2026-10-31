import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Contrail } from '@atmo-dev/contrail';
import { createSqliteDatabase } from '@atmo-dev/contrail/sqlite';
import { enrichInboxReports } from './profiles.server';
import { accountReport, eventReport, reporterProfile } from './inbox.fixtures';

let db: ReturnType<typeof createSqliteDatabase>;
let contrail: Contrail;
beforeEach(async () => {
	db = createSqliteDatabase(':memory:');
	contrail = new Contrail({
		namespace: 'rsvp.atmo',
		profiles: [{ collection: 'app.bsky.actor.profile', shortName: 'profile' }],
		collections: {}
	});
	await contrail.init(db);
});
afterEach(() => vi.restoreAllMocks());

describe('moderator-only profile metadata', () => {
	it('adds reporter and subject identities from local storage without remote lookups', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch');
		const did = reporterProfile.did;
		await db
			.prepare('INSERT INTO identities (did, handle, resolved_at) VALUES (?, ?, ?)')
			.bind(did, 'mika.example.com', Date.now())
			.run();
		await db
			.prepare(
				'INSERT INTO records_profile (uri, did, rkey, record, time_us, indexed_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(
				`at://${did}/app.bsky.actor.profile/self`,
				did,
				'self',
				JSON.stringify({ displayName: 'Mika Chen', avatar: { ref: { $link: 'bafyavatar' } } }),
				1,
				1
			)
			.run();
		const [report] = await enrichInboxReports(db, contrail.config, [eventReport]);
		expect(report.reporter).toMatchObject({
			did,
			name: 'Mika Chen',
			handle: 'mika.example.com',
			href: `/p/${encodeURIComponent(did)}`
		});
		expect(report.reporter?.avatar).toContain('/bafyavatar@webp');
		expect(report.subjectProfile?.did).toBe('did:plc:cccccccccccccccccccccccc');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('deduplicates profiles across a report page and handles missing metadata', async () => {
		const prepare = vi.spyOn(db, 'prepare');
		const reports = await enrichInboxReports(db, contrail.config, [eventReport, accountReport]);
		expect(prepare.mock.calls.filter(([sql]) => sql.includes('FROM identities'))).toHaveLength(1);
		expect(prepare.mock.calls.filter(([sql]) => sql.includes('FROM records_profile'))).toHaveLength(
			1
		);
		expect(reports[0].reporter?.did).toBe(eventReport.reportedBy);
		expect(reports[0].reporter?.handle).toBeUndefined();
		expect(reports[0].reporter).toEqual(reports[1].reporter);
	});

	it('does not apply public visibility filters to moderator metadata', async () => {
		const prepare = vi.spyOn(db, 'prepare');
		await enrichInboxReports(db, contrail.config, [eventReport]);
		const profileSql = prepare.mock.calls.find(([sql]) =>
			sql.includes('FROM records_profile')
		)?.[0];
		expect(profileSql).toContain('WHERE uri IN');
		expect(profileSql).not.toContain('moderation_hidden');
	});

	it('retains the report when optional profile metadata fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await db.prepare('DROP TABLE records_profile').run();
		const [report] = await enrichInboxReports(db, contrail.config, [eventReport]);
		expect(report.reason).toBe(eventReport.reason);
		expect(report.reporter?.did).toBe(eventReport.reportedBy);
	});
});
