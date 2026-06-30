// apps/web/scripts/geocode-events.ts
// CLI wrapper around the shared geocode core (lib/search/server/geocode-job.ts):
// runs it OFF Cloudflare against the openmeet-atmo D1 over the REST client, for
// the one-time bulk backfill and ad-hoc manual drips. The in-Worker cron drip
// (lib/geocode/process.ts) calls the same core over the native D1 binding. This
// wrapper owns the CLI surface: env/flag parsing, the public-Nominatim bulk
// guard, and client construction.
//
// Run (backfill MUST point the geocoder at LocationIQ, never public Nominatim):
//   CLOUDFLARE_API_TOKEN=… MEILI_URL=https://search.testnet.openmeet.net MEILI_KEY=… \
//   GEOCODER_URL=https://us1.locationiq.com/v1/search GEOCODER_KEY=… \
//     pnpm -C apps/web exec tsx scripts/geocode-events.ts --limit 50
import { createD1Client } from '../src/lib/search/server/d1-http';
import {
	createGeocoder,
	requireGeocoderForBulk,
	isPublicNominatimHost
} from '../src/lib/search/server/geocoder';
import { MeiliEventIndex } from '../src/lib/search/server/meili-sink';
import { runGeocodeJob } from '../src/lib/search/server/geocode-job';
import { DEFAULT_GEOCODE_SLEEP_MS } from '../src/lib/geocode/config';

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

// Throttle between geocoder calls (ms). Unset → the safe default; set → must be a
// finite, non-negative number. Fail loud on a malformed value here (a human typed
// it): an unvalidated Number() would yield NaN → sleep(NaN) ≈ 0ms and silently
// hammer the provider on a bulk backfill. (The core also clamps defensively.)
const parseSleepMs = (raw: string | undefined): number => {
	if (raw === undefined) return DEFAULT_GEOCODE_SLEEP_MS;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) {
		throw new Error(
			`GEOCODE_SLEEP_MS must be a non-negative number of milliseconds; got ${JSON.stringify(raw)}`
		);
	}
	return n;
};

const retryNegative = flag('--retry-negative');
const dryRun = flag('--dry-run');
const allowPublicNominatim = flag('--allow-public-nominatim');
const limit = parseLimit(opt('--limit', '0')); // 0 = no cap
const sleepMs = parseSleepMs(env.GEOCODE_SLEEP_MS);
// The effective geocoder is public OSM Nominatim when GEOCODER_URL is unset or
// points at the public host — EVEN if GEOCODER_KEY is set (createGeocoder ignores
// the key against Nominatim, the ?key= is dropped). Gate the bulk guard AND the
// cache provenance tag on the effective host, not key presence, so a
// key-without-URL run can't slip an uncapped backfill onto public Nominatim or
// mis-tag the cache rows as locationiq.
const onPublicNominatim = isPublicNominatimHost(env.GEOCODER_URL);

async function main() {
	if (!env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required');
	// No hardcoded account/DB fallbacks: the target D1 must be chosen explicitly so the
	// job can never silently write a baked-in database, and so no infra IDs live in source.
	if (!env.CLOUDFLARE_ACCOUNT_ID || !env.D1_DATABASE_ID)
		throw new Error('CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID are required');
	if (!env.MEILI_URL || !env.MEILI_KEY) throw new Error('MEILI_URL and MEILI_KEY are required');
	if (onPublicNominatim) {
		console.warn(
			'[geocode] effective geocoder is PUBLIC Nominatim' +
				(env.GEOCODER_KEY
					? ' (GEOCODER_KEY is set but GEOCODER_URL is unset/public, so the key is IGNORED)'
					: '') +
				'. OK for a small drip; a bulk backfill risks a silent IP ban. ' +
				'Set GEOCODER_URL to your LocationIQ endpoint for backfill.'
		);
	}
	// Hard-stop a bulk/uncapped run before it can touch public Nominatim — keyed on
	// the EFFECTIVE host so a GEOCODER_KEY with no URL (still public Nominatim) can't
	// slip the gate the way `!!GEOCODER_KEY` did.
	requireGeocoderForBulk({
		nonPublicEndpoint: !onPublicNominatim,
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

	await runGeocodeJob({
		d1,
		geocoder,
		meili,
		source: onPublicNominatim ? 'nominatim' : 'locationiq',
		limit,
		sleepMs,
		retryNegative,
		dryRun,
		log: (m) => console.log('[geocode]', m),
		warn: (m) => console.warn('[geocode]', m)
	});
}

main().catch((e) => {
	console.error('[geocode] fatal:', e);
	process.exit(1);
});
