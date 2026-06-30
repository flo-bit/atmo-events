// Address→_geo geocode drip — shared constants for the in-cron backfill of
// coordinates for newly-ingested address-only events. Mirrors lib/notify/config.

/** Cadence gate: the drip body runs at most once per this interval. It rides the
 *  every-minute cron (routes/api/cron) via a D1 timestamp, so a new address-only
 *  event waits at most ~this long for its _geo. 30 min keeps geocoder usage and
 *  D1 reads low while bounding that latency. */
export const GEOCODE_DRIP_INTERVAL_MS = 30 * 60 * 1000;

/** Max unique addresses geocoded per drip run. Each costs ~one geocoder call +
 *  GEOCODE_SLEEP_MS, so this bounds the run's wall time far under the 15-min cron
 *  cap and bounds per-tier geocoder spend. Leftover eligible work is picked up on
 *  the next run; steady-state inflow is well under the cap. */
export const MAX_GEOCODE_PER_TICK = 50;

/** Default min delay between geocoder calls, in ms — the rate limiter. Operators
 *  set GEOCODE_SLEEP_MS to the ceiling their geocoder tier allows (e.g. LocationIQ
 *  paid can go faster; public Nominatim wants >=1000). Sized safe-by-default; a
 *  drip's low volume makes the exact value latency-irrelevant. */
export const DEFAULT_GEOCODE_SLEEP_MS = 1100;
