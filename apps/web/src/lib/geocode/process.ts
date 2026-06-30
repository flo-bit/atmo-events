import {
	createGeocoder,
	isPublicNominatimHost,
	PUBLIC_NOMINATIM_DRIP_MAX,
	PUBLIC_NOMINATIM_MIN_SLEEP_MS
} from '$lib/search/server/geocoder';
import { MeiliEventIndex, meiliSinkBackendFromEnv } from '$lib/search/server/meili-sink';
import { nativeD1Client } from '$lib/search/server/d1-native';
import { runGeocodeJob } from '$lib/search/server/geocode-job';
import { GEOCODE_DRIP_INTERVAL_MS, MAX_GEOCODE_PER_TICK, DEFAULT_GEOCODE_SLEEP_MS } from './config';
import { ensureGeocodeDripSchema, claimDripSlot } from './db';

type Env = App.Platform['env'];

/** Configured when the Meili write path (the sink creds, reused) is present —
 *  that's the only hard requirement, since the drip just needs somewhere to write
 *  the resolved _geo. The geocoder works keyless against public Nominatim, so a
 *  key is OPTIONAL: keyless still runs the drip, just at Nominatim-safe limits (a
 *  smaller per-tick cap and a >=1 req/s throttle floor — see dripGeocoderPolicy);
 *  set GEOCODER_KEY + a non-public GEOCODER_URL (LocationIQ) to lift them. No sink
 *  → no-op (dev, or before search is provisioned). */
export function geocodeDripConfigured(env: Env): boolean {
	return meiliSinkBackendFromEnv(env) !== null;
}

/** Per-tick volume + throttle + cache-source tag for the drip. When the effective
 *  endpoint is public Nominatim (keyless, OR a key with an unset/public
 *  GEOCODER_URL — the ?key= is then ignored and we're really on Nominatim), both
 *  are clamped to Nominatim's usage policy: the per-tick cap drops to the small-
 *  drip ceiling and the throttle is floored to >=1 req/s. This keeps the keyless
 *  default safe for public use without refusing to run. A keyed, non-public
 *  endpoint (LocationIQ) keeps the full cap and honors the operator's throttle.
 *  Pure + exported so the safe-default policy can be unit-tested directly. */
export function dripGeocoderPolicy(env: Env): { limit: number; sleepMs: number; source: string } {
	const raw = Number(env.GEOCODE_SLEEP_MS);
	const requested = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GEOCODE_SLEEP_MS;
	if (isPublicNominatimHost(env.GEOCODER_URL)) {
		return {
			limit: Math.min(MAX_GEOCODE_PER_TICK, PUBLIC_NOMINATIM_DRIP_MAX),
			sleepMs: Math.max(requested, PUBLIC_NOMINATIM_MIN_SLEEP_MS),
			source: 'nominatim'
		};
	}
	return { limit: MAX_GEOCODE_PER_TICK, sleepMs: requested, source: 'locationiq' };
}

/** Entry point, called from the cron after firehose ingest. Resolves _geo for
 *  newly-ingested address-only events so they surface in /near-me. No-ops when
 *  unconfigured, and self-throttles to GEOCODE_DRIP_INTERVAL_MS via an atomic D1
 *  claim so it runs ~every 30 min while riding the every-minute cron — and so two
 *  overlapping ticks can't both start a drip (the claim is one conditional write,
 *  not a read-then-write). Idempotent: cached addresses are skipped, so a run with
 *  no new addresses makes ~zero geocoder calls. `now` is injectable for tests. */
export async function runGeocodeDrip(env: Env, db: D1Database, now = Date.now()): Promise<void> {
	if (!geocodeDripConfigured(env)) return;
	await ensureGeocodeDripSchema(db);

	// Atomically claim the cadence slot: a single conditional upsert that advances
	// the timestamp ONLY if a full interval has elapsed, reporting whether it won.
	// This both gates to the interval and closes the overlap window the old
	// read-then-write left open. A claimed-but-failed run waits one interval to
	// retry, which is fine for an idempotent drip.
	if (!(await claimDripSlot(db, now, GEOCODE_DRIP_INTERVAL_MS))) return;

	const backend = meiliSinkBackendFromEnv(env)!;
	const { limit, sleepMs, source } = dripGeocoderPolicy(env);
	// A key with no (or a public) URL silently hits Nominatim with the key ignored
	// — surface that misconfig rather than letting the operator believe they're on
	// LocationIQ. We still run (safely), just on Nominatim's reduced limits.
	if (env.GEOCODER_KEY && source === 'nominatim') {
		console.warn(
			'[geocode-drip] GEOCODER_KEY is set but GEOCODER_URL is unset or public Nominatim — the key ' +
				'is ignored and the drip runs on public Nominatim at its reduced cap/throttle. Set ' +
				'GEOCODER_URL to your LocationIQ endpoint to use the key.'
		);
	}

	await runGeocodeJob({
		d1: nativeD1Client(db),
		geocoder: createGeocoder(env),
		meili: new MeiliEventIndex(backend),
		source,
		limit,
		sleepMs,
		now,
		log: (m) => console.log('[geocode-drip]', m),
		warn: (m) => console.warn('[geocode-drip]', m)
	});
}
