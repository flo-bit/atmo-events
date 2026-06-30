// Shared core of the address→_geo geocode job: find address-only events that
// lack coordinates, geocode each unique address through the injected geocoder,
// write geocode_cache, and _geo-upsert the affected Meili docs. ONE job: "find
// work" and "geocode" are sequential steps sharing the cache, not two passes.
//
// Deliberately I/O-agnostic — it takes an injected D1Client, Geocoder, and
// MeiliEventIndex rather than reading env or constructing clients. Two callers:
//   • scripts/geocode-events.ts — off-box CLI, D1 over the REST client, one-shot
//     backfill / manual drip (keeps the CLI flags + bulk guard).
//   • lib/geocode/process.ts — in-Worker cron drip, D1 over the native binding
//     (no CLOUDFLARE_API_TOKEN), self-throttled to a cadence.
// Rate limiting is the caller-supplied sleep between calls — the whole reason
// geocoding stays off the ingest hot path.
import { addressToQuery, type Geocoder } from './geocoder';
import {
	isEligible,
	groupEventsByNorm,
	addressNeedingGeocode,
	type GeocodeCacheRow,
	type WorklistEvent
} from './geocode-cache';
import { eventToSearchDoc } from './normalize';
import { discoverableSql } from './discoverability';
import { MeiliEventIndex, EVENT_COLLECTION } from './meili-sink';
import type { D1Client } from './d1-http';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Worklist: discoverable events carrying a .address location. We deliberately
// do NOT exclude coordinate locations in SQL — that filtered by $type presence,
// which diverges from the sink's actual _geo derivation (it ignored fsq, and
// excluded events whose only geo/hthree coords are out of range and so never
// get an in-index _geo). The precise "does this already resolve to coordinates?"
// decision is made in memory by addressNeedingGeocode (recordGeo), the same
// derivation the sink uses. json_each walks locations[]; the "$type" key is
// quoted because it starts with $.
//
// The CASE WHEN json_valid(r.record) guard is REQUIRED, not belt-and-suspenders:
// json_each / json_extract raise "malformed JSON" and abort the ENTIRE query on a
// single poison record, which would fail the whole drip/backfill — so one bad row
// must not even reach them. We use CASE rather than `json_valid(...) AND ...`
// because SQLite guarantees lazy, per-branch evaluation for CASE, whereas WHERE
// conjuncts are optimizer-reorderable (their left-to-right short-circuit is not a
// contract): the THEN holding json_each/json_extract is evaluated ONLY when
// json_valid is true. (The in-memory JSON.parse skip below is a second layer, but
// it never runs if the SQL itself aborts.)
const WORKLIST_SQL = `
SELECT r.uri AS uri, r.did AS did, r.rkey AS rkey, r.record AS record
FROM records_event AS r
WHERE CASE WHEN json_valid(r.record) THEN (
    EXISTS (
      SELECT 1 FROM json_each(r.record, '$.locations')
      WHERE json_extract(value, '$."$type"') = 'community.lexicon.location.address')
    AND ${discoverableSql('r.record')}
  ) ELSE 0 END
`;

// Re-read events from records_event by uri, keeping only those still present and
// discoverable. The parsed record drives a full-doc upsert, so it's read fresh
// (not from the job-start worklist) — an event deleted or unlisted while the slow
// geocode loop runs is skipped here instead of being resurrected as a stale doc.
async function fetchLiveDocs(
	d1: D1Client,
	uris: string[]
): Promise<{ uri: string; did: string; rkey: string; record: Record<string, unknown> }[]> {
	if (uris.length === 0) return [];
	const placeholders = uris.map(() => '?').join(',');
	// CASE-guard discoverableSql for the same reason as WORKLIST_SQL: json_extract
	// aborts the query on a poison record. CASE guarantees the THEN (json_extract)
	// runs ONLY when json_valid is true — robust against the WHERE-conjunct
	// reordering a bare `... AND json_valid(record) AND json_extract(...)` leaves to
	// the optimizer. uri IN (...) still narrows the scan to the candidate rows.
	const rows = await d1.query<{ uri: string; did: string; rkey: string; record: string }>(
		`SELECT uri, did, rkey, record FROM records_event
		 WHERE uri IN (${placeholders})
		   AND CASE WHEN json_valid(record) THEN ${discoverableSql('record')} ELSE 0 END`,
		uris
	);
	const out: { uri: string; did: string; rkey: string; record: Record<string, unknown> }[] = [];
	for (const r of rows) {
		try {
			out.push({ uri: r.uri, did: r.did, rkey: r.rkey, record: JSON.parse(r.record) });
		} catch {
			// Unparseable record JSON — skip, same as the worklist parse.
		}
	}
	return out;
}

export interface GeocodeJobOptions {
	d1: D1Client;
	geocoder: Geocoder;
	meili: MeiliEventIndex;
	/** Cache provenance tag written to geocode_cache.source ('locationiq'|'nominatim'). */
	source: string;
	/** Max unique addresses to process this run; 0 = no cap. */
	limit?: number;
	/** Delay between geocoder calls in ms — the rate limiter. */
	sleepMs?: number;
	/** Force-retry negative-cached addresses (ignores backoff). */
	retryNegative?: boolean;
	/** Compute the worklist and log it, but make no geocoder/cache/Meili writes. */
	dryRun?: boolean;
	/** Injectable clock (eligibility backoff + geocoded_at); defaults to now. */
	now?: number;
	/** Progress line sink; callers prefix as they like. Default: no-op. */
	log?: (msg: string) => void;
	/** Transient-error sink. Default: no-op. */
	warn?: (msg: string) => void;
}

export interface GeocodeJobResult {
	worklistEvents: number;
	uniqueAddresses: number;
	eligible: number;
	processed: number;
	resolved: number;
	negative: number;
	transient: number;
	skippedGone: number;
}

/** Run one geocode pass over the eligible worklist. Pure orchestration over the
 *  injected clients; idempotent (cached addresses are skipped via isEligible), so
 *  a steady-state run with no new addresses makes ~zero geocoder calls. */
export async function runGeocodeJob(opts: GeocodeJobOptions): Promise<GeocodeJobResult> {
	const {
		d1,
		geocoder,
		meili,
		source,
		limit = 0,
		sleepMs,
		retryNegative = false,
		dryRun = false,
		now = Date.now(),
		log = () => {},
		warn = () => {}
	} = opts;

	// Defensive throttle: a caller passing NaN/negative/undefined (e.g. a malformed
	// GEOCODE_SLEEP_MS that slipped past a caller's own parse) must not collapse the
	// rate limiter into a busy loop. undefined → the safe 1100ms default; any
	// non-finite or negative value → the same. This is the single clamp both the
	// Worker drip and the CLI rely on, so the loop below never sleeps on a bad value.
	const throttleMs =
		typeof sleepMs === 'number' && Number.isFinite(sleepMs) && sleepMs >= 0 ? sleepMs : 1100;

	// This CREATE is the authoritative definition of geocode_cache: like the
	// app's other D1 tables it lives in code and self-heals, so a fresh DB just
	// works on first run with nothing to apply by hand.
	await d1.query(
		`CREATE TABLE IF NOT EXISTS geocode_cache (
      address_norm TEXT PRIMARY KEY, lat REAL, lng REAL, precision TEXT,
      source TEXT NOT NULL, geocoded_at INTEGER NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0, last_error TEXT)`
	);

	// Load the whole cache once (small) and decide eligibility in memory.
	const cacheRows = await d1.query<GeocodeCacheRow>(`SELECT * FROM geocode_cache`);
	const cache = new Map(cacheRows.map((r) => [r.address_norm, r]));

	// Worklist → WorklistEvent[] (parse record JSON; keep only events that need
	// geocoding — an address location AND no coordinates the index already
	// derives, per addressNeedingGeocode).
	const rawEvents = await d1.query<{ uri: string; did: string; rkey: string; record: string }>(
		WORKLIST_SQL
	);
	const events: WorklistEvent[] = [];
	for (const e of rawEvents) {
		let record: Record<string, unknown>;
		try {
			record = JSON.parse(e.record);
		} catch {
			continue;
		}
		const loc = addressNeedingGeocode(record);
		if (loc) events.push({ uri: e.uri, did: e.did, rkey: e.rkey, loc });
	}

	const byNorm = groupEventsByNorm(events);
	const work = [...byNorm.entries()].filter(([norm]) =>
		isEligible(cache.get(norm), now, retryNegative)
	);
	const capped = limit > 0 ? work.slice(0, limit) : work;

	log(
		`worklist events=${events.length} unique-addresses=${byNorm.size} ` +
			`eligible=${work.length} processing=${capped.length}${dryRun ? ' (dry-run)' : ''}`
	);

	let resolved = 0;
	let negative = 0;
	let transient = 0;
	let skippedGone = 0;
	// Apply the read-path's filterable/sortable settings once, lazily, before the
	// FIRST upsert. A PUT to a bare auto-created index would 400 the read path's
	// _geo/startsAt filters; the sink ensures this for live ingest, but a drip can
	// be the first writer to a freshly (re)created index. Only fires when there's
	// actually a doc to write, so a no-resolution run touches Meili zero times.
	let settingsApplied = false;
	for (let i = 0; i < capped.length; i++) {
		const [norm, group] = capped[i];
		const query = addressToQuery(group[0].loc);
		if (dryRun) {
			log(`would geocode "${query}" -> ${group.length} event(s)`);
			continue;
		}
		try {
			const point = await geocoder.geocode(query);
			if (point) {
				// Re-read the events fresh and upsert the FULL doc with _geo attached,
				// keeping only those still present AND discoverable. A full-doc upsert is
				// idempotent and needs no "is it indexed?" snapshot: it merges if the
				// event is already indexed, lands a complete doc if not (never a {id,_geo}
				// stub), and is identical to what the sink writes — so a concurrent sink
				// write converges instead of clobbering.
				const live = await fetchLiveDocs(
					d1,
					group.map((e) => e.uri)
				);
				skippedGone += group.length - live.length;
				if (live.length) {
					if (!settingsApplied) {
						await meili.applySettings();
						settingsApplied = true;
					}
					await meili.upsert(
						live.map((r) => {
							const doc = eventToSearchDoc({
								uri: r.uri,
								did: r.did,
								collection: EVENT_COLLECTION,
								rkey: r.rkey,
								record: r.record
							});
							// Don't overwrite a coordinate _geo the record gained mid-run.
							if (!doc._geo) doc._geo = { lat: point.lat, lng: point.lng };
							return doc;
						})
					);
				}
				// Write the positive cache row ONLY after the Meili write succeeds (or
				// when there's no live doc to write). If applySettings/upsert throws, the
				// catch below counts it transient and we do NOT cache — so the address
				// stays eligible and retries next run, instead of being cached "resolved"
				// yet never indexed: a permanent _geo gap the idempotent skip would lock
				// in. A redundant re-geocode on the rare Meili failure is the cheap price.
				await d1.query(
					`INSERT INTO geocode_cache (address_norm, lat, lng, precision, source, geocoded_at, fail_count, last_error)
					 VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
					 ON CONFLICT(address_norm) DO UPDATE SET
					   lat=excluded.lat, lng=excluded.lng, precision=excluded.precision,
					   source=excluded.source, geocoded_at=excluded.geocoded_at, fail_count=0, last_error=NULL`,
					[norm, point.lat, point.lng, point.precision ?? null, source, now]
				);
				resolved++;
			} else {
				// No-match: write/increment a negative row (backoff handled by isEligible).
				await d1.query(
					`INSERT INTO geocode_cache (address_norm, lat, lng, precision, source, geocoded_at, fail_count, last_error)
					 VALUES (?, NULL, NULL, NULL, ?, ?, 1, 'no match')
					 ON CONFLICT(address_norm) DO UPDATE SET
					   source=excluded.source, geocoded_at=excluded.geocoded_at, fail_count=geocode_cache.fail_count+1, last_error='no match'`,
					[norm, source, now]
				);
				negative++;
			}
		} catch (err) {
			// Transient (HTTP/network): DON'T write a negative row — retry next run.
			transient++;
			warn(`transient error for "${query}": ${(err as Error).message}`);
		}
		// Throttle BETWEEN geocoder calls only — skip the trailing sleep after the
		// last one, which would just waste a sleepMs at the end of every run.
		if (i < capped.length - 1) await sleep(throttleMs);
	}

	log(
		`done resolved=${resolved} negative=${negative} transient=${transient} ` +
			`skipped-gone=${skippedGone}`
	);

	return {
		worklistEvents: events.length,
		uniqueAddresses: byNorm.size,
		eligible: work.length,
		processed: capped.length,
		resolved,
		negative,
		transient,
		skippedGone
	};
}
