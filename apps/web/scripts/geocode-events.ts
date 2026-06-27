// apps/web/scripts/geocode-events.ts
// External geocode job (runs OFF Cloudflare): finds address-only events in the
// openmeet-atmo D1 that lack coordinates, geocodes each unique address through
// the config-selected Nominatim/LocationIQ client, writes geocode_cache, and
// _geo-updates the affected Meili docs. ONE job: "find work" and "geocode" are
// sequential steps sharing the cache, not two passes. Rate limiting is the
// sleep between calls — the whole reason geocoding stays off Workers.
//
// Run (backfill MUST point the geocoder at LocationIQ, never public Nominatim):
//   CLOUDFLARE_API_TOKEN=… MEILI_URL=https://search.testnet.openmeet.net MEILI_KEY=… \
//   GEOCODER_URL=https://us1.locationiq.com/v1/search GEOCODER_KEY=… \
//     pnpm -C apps/web exec tsx scripts/geocode-events.ts --limit 50
import { createD1Client, type D1Client } from '../src/lib/search/server/d1-http';
import {
	createGeocoder,
	addressToQuery,
	requireGeocoderForBulk
} from '../src/lib/search/server/geocoder';
import {
	isEligible,
	groupEventsByNorm,
	addressNeedingGeocode,
	type GeocodeCacheRow,
	type WorklistEvent
} from '../src/lib/search/server/geocode-cache';
import { eventToSearchDoc } from '../src/lib/search/server/normalize';
import { discoverableSql } from '../src/lib/search/server/discoverability';
import { MeiliEventIndex, EVENT_COLLECTION } from '../src/lib/search/server/meili-sink';

const env = process.env;
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string, def?: string) => {
	const i = argv.indexOf(name);
	return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

// Strict: 0 = no cap, otherwise a positive integer. Reject negatives/non-integers
// up front — `Number('-1') || 0` is -1, which used to slip past BOTH the bulk
// guard (its old limit===0 check) and the cap (`limit > 0 ? slice : all`),
// silently running an uncapped keyless backfill against public Nominatim.
const parseLimit = (raw: string | undefined): number => {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) {
		throw new Error(
			`--limit must be a non-negative integer (0 = no cap); got ${JSON.stringify(raw)}`
		);
	}
	return n;
};

const retryNegative = flag('--retry-negative');
const dryRun = flag('--dry-run');
const allowPublicNominatim = flag('--allow-public-nominatim');
const limit = parseLimit(opt('--limit', '0')); // 0 = no cap
const sleepMs = Number(env.GEOCODE_SLEEP_MS ?? '1100');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Worklist: discoverable events carrying a .address location. We deliberately
// do NOT exclude coordinate locations in SQL — that filtered by $type presence,
// which diverges from the sink's actual _geo derivation (it ignored fsq, and
// excluded events whose only geo/hthree coords are out of range and so never
// get an in-index _geo). The precise "does this already resolve to coordinates?"
// decision is made in memory by addressNeedingGeocode (recordGeo), the same
// derivation the sink uses. json_each walks locations[]; the "$type" key is
// quoted because it starts with $.
const WORKLIST_SQL = `
SELECT r.uri AS uri, r.did AS did, r.rkey AS rkey, r.record AS record
FROM records_event AS r
WHERE EXISTS (
    SELECT 1 FROM json_each(r.record, '$.locations')
    WHERE json_extract(value, '$."$type"') = 'community.lexicon.location.address')
  AND ${discoverableSql('r.record')}
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
	const rows = await d1.query<{ uri: string; did: string; rkey: string; record: string }>(
		`SELECT uri, did, rkey, record FROM records_event
		 WHERE uri IN (${placeholders}) AND ${discoverableSql('record')}`,
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

async function main() {
	if (!env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required');
	// No hardcoded account/DB fallbacks: the target D1 must be chosen explicitly so the
	// job can never silently write a baked-in database, and so no infra IDs live in source.
	if (!env.CLOUDFLARE_ACCOUNT_ID || !env.D1_DATABASE_ID)
		throw new Error('CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID are required');
	if (!env.MEILI_URL || !env.MEILI_KEY) throw new Error('MEILI_URL and MEILI_KEY are required');
	if (!env.GEOCODER_KEY) {
		console.warn(
			'[geocode] GEOCODER_KEY is unset → using PUBLIC Nominatim. OK for a small drip; ' +
				'a bulk backfill against public Nominatim risks a silent IP ban. Use LocationIQ for backfill.'
		);
	}
	// Hard-stop a bulk/uncapped keyless run before it can touch public Nominatim.
	requireGeocoderForBulk({
		hasKey: !!env.GEOCODER_KEY,
		dryRun,
		limit,
		allowPublic: allowPublicNominatim
	});

	const d1 = createD1Client({
		accountId: env.CLOUDFLARE_ACCOUNT_ID,
		databaseId: env.D1_DATABASE_ID,
		apiToken: env.CLOUDFLARE_API_TOKEN
	});
	const geocoder = createGeocoder(env);
	const meili = new MeiliEventIndex({
		url: env.MEILI_URL,
		apiKey: env.MEILI_KEY,
		indexUid: env.SEARCH_INDEX ?? 'events'
	});

	// Defensive: the table is created by geocode-cache.sql, but a fresh DB
	// shouldn't make the job crash before it can self-heal.
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
	const now = Date.now();
	const work = [...byNorm.entries()].filter(([norm]) =>
		isEligible(cache.get(norm), now, retryNegative)
	);
	const capped = limit > 0 ? work.slice(0, limit) : work;

	console.log(
		`[geocode] worklist events=${events.length} unique-addresses=${byNorm.size} ` +
			`eligible=${work.length} processing=${capped.length}${dryRun ? ' (dry-run)' : ''}`
	);

	let resolved = 0;
	let negative = 0;
	let transient = 0;
	let skippedGone = 0;
	for (const [norm, group] of capped) {
		const query = addressToQuery(group[0].loc);
		if (dryRun) {
			console.log(`[geocode] would geocode "${query}" -> ${group.length} event(s)`);
			continue;
		}
		try {
			const point = await geocoder.geocode(query);
			if (point) {
				await d1.query(
					`INSERT INTO geocode_cache (address_norm, lat, lng, precision, source, geocoded_at, fail_count, last_error)
					 VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
					 ON CONFLICT(address_norm) DO UPDATE SET
					   lat=excluded.lat, lng=excluded.lng, precision=excluded.precision,
					   source=excluded.source, geocoded_at=excluded.geocoded_at, fail_count=0, last_error=NULL`,
					[
						norm,
						point.lat,
						point.lng,
						point.precision ?? null,
						env.GEOCODER_KEY ? 'locationiq' : 'nominatim',
						now
					]
				);
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
				resolved++;
			} else {
				// No-match: write/increment a negative row (backoff handled by isEligible).
				await d1.query(
					`INSERT INTO geocode_cache (address_norm, lat, lng, precision, source, geocoded_at, fail_count, last_error)
					 VALUES (?, NULL, NULL, NULL, ?, ?, 1, 'no match')
					 ON CONFLICT(address_norm) DO UPDATE SET
					   source=excluded.source, geocoded_at=excluded.geocoded_at, fail_count=geocode_cache.fail_count+1, last_error='no match'`,
					[norm, env.GEOCODER_KEY ? 'locationiq' : 'nominatim', now]
				);
				negative++;
			}
		} catch (err) {
			// Transient (HTTP/network): DON'T write a negative row — retry next run.
			transient++;
			console.warn(`[geocode] transient error for "${query}": ${(err as Error).message}`);
		}
		await sleep(sleepMs);
	}

	console.log(
		`[geocode] done resolved=${resolved} negative=${negative} transient=${transient} ` +
			`skipped-gone=${skippedGone}`
	);
}

main().catch((e) => {
	console.error('[geocode] fatal:', e);
	process.exit(1);
});
