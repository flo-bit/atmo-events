import { afterEach, describe, expect, it } from 'vitest';
import { budgetPeriods, claimGeneration, LEASE_MS, releaseGeneration } from './budget';
import { testDb } from './testing';

const databases: ReturnType<typeof testDb>[] = [];
function setup() {
	const result = testDb();
	databases.push(result);
	return result;
}
afterEach(() => {
	for (const { sqlite } of databases.splice(0)) sqlite.close();
});
const now = Date.parse('2026-10-13T12:00:00Z');

describe('atomic global generation budget', () => {
	it('deduplicates concurrent claims for the same image across isolates', async () => {
		const { db, sqlite } = setup();
		const claims = await Promise.all(
			Array.from({ length: 20 }, () => claimGeneration({ DB: db }, 'same', now))
		);
		expect(claims.filter(Boolean)).toHaveLength(1);
		expect(
			sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()?.daily_attempts
		).toBe(1);
	});

	it('bounds many distinct image requests globally and does not create denied leases', async () => {
		const { db, sqlite } = setup();
		const claims = await Promise.all(
			Array.from({ length: 40 }, (_, i) =>
				claimGeneration(
					{
						DB: db,
						OG_DAILY_GENERATION_LIMIT: '3'
					},
					`image-${i}`,
					now
				)
			)
		);
		expect(claims.filter(Boolean)).toHaveLength(3);
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM og_generation_leases').get()?.n).toBe(3);
	});

	it('retains failed/crashed attempts in the quota, with an expiring lease', async () => {
		const { db, sqlite } = setup();
		expect(await claimGeneration({ DB: db }, 'failed', now)).toBeTruthy();
		expect(await claimGeneration({ DB: db }, 'failed', now + LEASE_MS - 1)).toBeNull();
		expect(await claimGeneration({ DB: db }, 'failed', now + LEASE_MS)).toBeTruthy();
		expect(
			sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()?.daily_attempts
		).toBe(2);
	});

	it('does not allow an old token to release another generation lease', async () => {
		const { db } = setup();
		const old = await claimGeneration({ DB: db }, 'same', now);
		await claimGeneration({ DB: db }, 'same', now + LEASE_MS);
		await releaseGeneration(db, 'same', old!);
		expect(await claimGeneration({ DB: db }, 'same', now + LEASE_MS + 1)).toBeNull();
	});

	it('resets daily counts but preserves the billing-cycle cap until the 13th', async () => {
		const { db } = setup();
		const env = { DB: db, OG_DAILY_GENERATION_LIMIT: '1', OG_CYCLE_GENERATION_LIMIT: '2' };
		expect(await claimGeneration(env, 'one', now)).toBeTruthy();
		expect(await claimGeneration(env, 'two', now)).toBeNull();
		expect(await claimGeneration(env, 'two', now + 86400000)).toBeTruthy();
		expect(await claimGeneration(env, 'three', Date.parse('2026-11-12T12:00:00Z'))).toBeNull();
		expect(await claimGeneration(env, 'three', Date.parse('2026-11-13T00:00:00Z'))).toBeTruthy();
	});

	it('never resets counters backwards for a delayed request', async () => {
		const { db } = setup();
		expect(await claimGeneration({ DB: db }, 'today', now)).toBeTruthy();
		expect(await claimGeneration({ DB: db }, 'old', now - 86400000)).toBeNull();
	});

	it('fails closed on disabled/invalid configuration or missing schema', async () => {
		const { db, sqlite } = setup();
		for (const value of ['0', '-1', 'bad', '1.2']) {
			expect(
				await claimGeneration({ DB: db, OG_DAILY_GENERATION_LIMIT: value }, 'same', now)
			).toBeNull();
		}
		expect(
			await claimGeneration({ DB: db, OG_BILLING_CYCLE_START_DAY: '32' }, 'same', now)
		).toBeNull();
		sqlite.exec('DROP TABLE og_generation_leases');
		await expect(claimGeneration({ DB: db }, 'same', now)).rejects.toThrow();
		expect(
			sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()?.daily_attempts
		).toBe(0);
	});

	it('rolls back quota consumption when lease insertion fails', async () => {
		const { db, sqlite } = setup();
		sqlite.exec(`CREATE TRIGGER fail_lease BEFORE INSERT ON og_generation_leases
			BEGIN SELECT RAISE(ABORT, 'lease storage failed'); END`);
		await expect(claimGeneration({ DB: db }, 'same', now)).rejects.toThrow('lease storage failed');
		expect(
			sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()?.daily_attempts
		).toBe(0);
	});

	it('handles UTC billing-cycle boundaries, including January', () => {
		expect(budgetPeriods(Date.parse('2026-10-12T23:59:59Z'), 13).cycle).toBe('2026-09-13');
		expect(budgetPeriods(Date.parse('2026-10-13T00:00:00Z'), 13).cycle).toBe('2026-10-13');
		expect(budgetPeriods(Date.parse('2027-01-01T00:00:00Z'), 13).cycle).toBe('2026-12-13');
	});
});
