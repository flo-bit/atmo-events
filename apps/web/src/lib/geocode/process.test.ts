import { describe, it, expect } from 'vitest';
import { runGeocodeDrip, geocodeDripConfigured, dripGeocoderPolicy } from './process';
import { GEOCODE_DRIP_INTERVAL_MS, MAX_GEOCODE_PER_TICK, DEFAULT_GEOCODE_SLEEP_MS } from './config';
import {
	PUBLIC_NOMINATIM_DRIP_MAX,
	PUBLIC_NOMINATIM_MIN_SLEEP_MS
} from '../search/server/geocoder';

type Env = Parameters<typeof runGeocodeDrip>[0];

/** The drip needs only the sink creds; the geocoder key is optional (keyless runs
 *  on public Nominatim at safe limits). Tests add GEOCODER_* / GEOCODE_SLEEP_MS. */
const configuredEnv = (over: Partial<Env> = {}): Env =>
	({
		SEARCH_SINK_URL: 'http://meili.test',
		SEARCH_SINK_API_KEY: 'admin-key',
		...over
	}) as Env;

const locationiqEnv = (over: Partial<Env> = {}): Env =>
	configuredEnv({
		GEOCODER_KEY: 'loc-key',
		GEOCODER_URL: 'https://us1.locationiq.com/v1/search',
		...over
	});

/** Minimal stand-in for the native D1 binding. Implements the atomic cadence
 *  claim (INSERT ... ON CONFLICT DO UPDATE ... WHERE → meta.changes) against an
 *  in-memory value, and returns empty results for everything else so the core
 *  runs but does no network. Records every prepared SQL so tests count core runs.
 *  `failCore` makes the core's geocode_cache queries throw, to test that the
 *  cadence slot is claimed BEFORE the work (a failed run still advances it). */
function fakeNativeDb(opts: { failCore?: boolean } = {}) {
	const state = new Map<string, number>();
	const sqls: string[] = [];
	const db = {
		prepare(sql: string) {
			sqls.push(sql);
			let bound: unknown[] = [];
			const stmt = {
				bind(...args: unknown[]) {
					bound = args;
					return stmt;
				},
				async first<T>() {
					return null as T;
				},
				async all<T>() {
					if (opts.failCore && sql.includes('geocode_cache')) {
						throw new Error('core query failed');
					}
					return { results: [] as T[] };
				},
				async run() {
					if (sql.includes('INSERT INTO geocode_drip_state')) {
						const [key, value, interval] = bound as [string, number, number];
						const prev = state.get(key);
						const claimed = prev === undefined || value - prev >= interval;
						if (claimed) state.set(key, value);
						return { success: true, meta: { changes: claimed ? 1 : 0 } };
					}
					return { success: true, meta: { changes: 0 } };
				}
			};
			return stmt;
		}
	} as unknown as D1Database;
	return { db, sqls, state };
}

const coreRuns = (sqls: string[]) =>
	sqls.filter((s) => s.includes('CREATE TABLE IF NOT EXISTS geocode_cache')).length;

describe('geocodeDripConfigured', () => {
	it('requires only the sink creds — the geocoder key is optional', () => {
		expect(geocodeDripConfigured(configuredEnv())).toBe(true);
		expect(geocodeDripConfigured(locationiqEnv())).toBe(true);
	});

	it('is false without the sink (nowhere to write _geo)', () => {
		expect(geocodeDripConfigured(configuredEnv({ SEARCH_SINK_URL: undefined }))).toBe(false);
		expect(geocodeDripConfigured(configuredEnv({ SEARCH_SINK_API_KEY: undefined }))).toBe(false);
	});
});

describe('dripGeocoderPolicy', () => {
	it('keyless → public Nominatim safe defaults: small cap, ≥1 req/s, source nominatim', () => {
		const p = dripGeocoderPolicy(configuredEnv());
		expect(p.source).toBe('nominatim');
		expect(p.limit).toBe(Math.min(MAX_GEOCODE_PER_TICK, PUBLIC_NOMINATIM_DRIP_MAX));
		expect(p.sleepMs).toBe(DEFAULT_GEOCODE_SLEEP_MS);
		expect(p.sleepMs).toBeGreaterThanOrEqual(PUBLIC_NOMINATIM_MIN_SLEEP_MS);
	});

	it('floors a too-fast GEOCODE_SLEEP_MS on Nominatim to the policy minimum', () => {
		const p = dripGeocoderPolicy(configuredEnv({ GEOCODE_SLEEP_MS: '100' }));
		expect(p.sleepMs).toBe(PUBLIC_NOMINATIM_MIN_SLEEP_MS);
	});

	it('a key with no URL still hits Nominatim → safe defaults, key ignored, source nominatim', () => {
		const p = dripGeocoderPolicy(configuredEnv({ GEOCODER_KEY: 'k' }));
		expect(p.source).toBe('nominatim');
		expect(p.limit).toBe(Math.min(MAX_GEOCODE_PER_TICK, PUBLIC_NOMINATIM_DRIP_MAX));
		expect(p.sleepMs).toBeGreaterThanOrEqual(PUBLIC_NOMINATIM_MIN_SLEEP_MS);
	});

	it('keyed LocationIQ endpoint lifts the cap and honors the operator throttle', () => {
		const p = dripGeocoderPolicy(locationiqEnv({ GEOCODE_SLEEP_MS: '300' }));
		expect(p.source).toBe('locationiq');
		expect(p.limit).toBe(MAX_GEOCODE_PER_TICK);
		expect(p.sleepMs).toBe(300);
	});

	it('falls back to the default throttle on a malformed GEOCODE_SLEEP_MS', () => {
		expect(dripGeocoderPolicy(locationiqEnv({ GEOCODE_SLEEP_MS: 'abc' })).sleepMs).toBe(
			DEFAULT_GEOCODE_SLEEP_MS
		);
		// negative on the LocationIQ path also falls back (no floor there)
		expect(dripGeocoderPolicy(locationiqEnv({ GEOCODE_SLEEP_MS: '-5' })).sleepMs).toBe(
			DEFAULT_GEOCODE_SLEEP_MS
		);
	});
});

describe('runGeocodeDrip cadence gate', () => {
	it('no-ops when unconfigured (touches no D1)', async () => {
		const { db, sqls } = fakeNativeDb();
		await runGeocodeDrip(configuredEnv({ SEARCH_SINK_URL: undefined }), db, 1_000);
		expect(sqls).toHaveLength(0);
	});

	it('runs on first call, skips within the interval, runs again after it', async () => {
		const { db, sqls } = fakeNativeDb();
		const t0 = 1_700_000_000_000;

		await runGeocodeDrip(configuredEnv(), db, t0);
		expect(coreRuns(sqls)).toBe(1);

		// 1 min later — inside the 30-min interval → gated out, core does not run.
		await runGeocodeDrip(configuredEnv(), db, t0 + 60_000);
		expect(coreRuns(sqls)).toBe(1);

		// Past the interval → runs again.
		await runGeocodeDrip(configuredEnv(), db, t0 + GEOCODE_DRIP_INTERVAL_MS + 1);
		expect(coreRuns(sqls)).toBe(2);
	});

	it('claim-before-work: a failed run still advances the slot, so the next tick gates out', async () => {
		const { db, sqls } = fakeNativeDb({ failCore: true });
		const t0 = 1_700_000_000_000;

		// The core throws, but the slot was claimed before the work began.
		await expect(runGeocodeDrip(configuredEnv(), db, t0)).rejects.toThrow();
		expect(coreRuns(sqls)).toBe(1);

		// Next tick within the interval is gated out — no retry-storm despite the failure.
		await runGeocodeDrip(configuredEnv(), db, t0 + 60_000);
		expect(coreRuns(sqls)).toBe(1);
	});
});
