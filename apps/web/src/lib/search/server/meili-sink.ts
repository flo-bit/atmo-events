// Search sink: the write half of the Meilisearch search path. Implements the
// contrail `Sink` seam (flo-bit/contrail#54) — a write-only, post-commit
// observer that contrail invokes after every applyEvents() commit, on both the
// live (jetstream / notify) and backfill paths. We forward calendar-event
// records into the Meilisearch `events` index that ./meili.ts reads from, so
// atmo's own in-process cron ingest indexes search WITHOUT a separate
// standalone indexer.
//
// Constraints inherited from the seam:
//   - sinks only ever observe PUBLIC records (space-scoped/private records
//     never reach applyEvents), so there's no `space` to skip — unlike the old
//     realtime-pubsub masquerade this supersedes;
//   - a thrown sink is caught and logged by contrail and never blocks ingest,
//     so a Meilisearch outage degrades to "search index falls behind", not
//     "ingest stops".
import { eventToSearchDoc, searchDocId, type SearchDoc } from './normalize';
import { addressLocation, normalizeAddress } from './address-norm';
import { isHiddenFromDiscovery } from './discoverability';
import type { ContrailConfig } from '@atmo-dev/contrail';

// The umbrella re-exports ContrailConfig (which carries `sinks?: Sink[]`) but
// not the Sink / RecordEvent names, so derive them from the config type rather
// than importing @atmo-dev/contrail-base directly (not a direct dependency).
type Sink = NonNullable<ContrailConfig['sinks']>[number];
type RecordEvent = Parameters<Sink['onRecords']>[0][number];

/** The one collection we index for search. */
export const EVENT_COLLECTION = 'community.lexicon.calendar.event';

export interface MeiliSinkBackend {
	url: string;
	apiKey: string;
	indexUid?: string;
}

export interface MeiliSinkEnv {
	/** Meilisearch base url for the WRITE path. Distinct from the read path's
	 *  SEARCH_URL so the sink can use the admin key while the read path stays on
	 *  the search-only key. When unset, the sink is disabled (ingest still runs). */
	SEARCH_SINK_URL?: string;
	/** Default Admin API Key (write). Set via `wrangler secret put`. Never the
	 *  instance root key. */
	SEARCH_SINK_API_KEY?: string;
	/** Index uid; defaults to `events`. Shared with the read path (the sink
	 *  writes the same index ./meili.ts reads), so there is one index var, not a
	 *  separate write-side override. */
	SEARCH_INDEX?: string;
}

/** Resolves the sink backend from Worker env, or null when unconfigured. Does
 *  not throw — a Worker should degrade to "no search feed", not crash ingest.
 *  Warns (rather than silently no-ops) on the half-configured case. */
export function meiliSinkBackendFromEnv(env?: MeiliSinkEnv): MeiliSinkBackend | null {
	if (!env?.SEARCH_SINK_URL) return null;
	if (!env.SEARCH_SINK_API_KEY) {
		console.warn(
			'[search-sink] SEARCH_SINK_URL is set but SEARCH_SINK_API_KEY is not; sink disabled'
		);
		return null;
	}
	return {
		url: env.SEARCH_SINK_URL,
		apiKey: env.SEARCH_SINK_API_KEY,
		indexUid: env.SEARCH_INDEX
	};
}

/** Minimal fetch-based Meilisearch write client for the event index. Auth uses
 *  the Default Admin API Key; the instance root key stays out of the Worker. */
export class MeiliEventIndex {
	private readonly base: string;
	private readonly apiKey: string;
	private readonly indexUid: string;
	private readonly fetch: typeof fetch;

	constructor(backend: MeiliSinkBackend, fetchFn: typeof fetch = globalThis.fetch) {
		this.base = backend.url.replace(/\/+$/, '');
		this.apiKey = backend.apiKey;
		this.indexUid = backend.indexUid ?? 'events';
		this.fetch = fetchFn;
	}

	/** PATCHing settings auto-creates the index, so this doubles as ensure-index.
	 *  _geo in filterable enables _geoRadius/_geoBoundingBox; in sortable, _geoPoint.
	 *  Must mirror the filters ./meili.ts issues (startsAt/endsAt range, _geo). */
	async applySettings(): Promise<void> {
		await this.request('PATCH', `/indexes/${this.indexUid}/settings`, {
			searchableAttributes: ['name', 'description'],
			filterableAttributes: [
				'_geo',
				'startsAt',
				'endsAt',
				'status',
				'mode',
				'did',
				'locationTypes'
			],
			sortableAttributes: ['_geo', 'startsAt', 'endsAt']
		});
	}

	async upsert(docs: SearchDoc[]): Promise<void> {
		if (docs.length === 0) return;
		await this.request('PUT', `/indexes/${this.indexUid}/documents?primaryKey=id`, docs);
	}

	async remove(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		await this.request('POST', `/indexes/${this.indexUid}/documents/delete-batch`, ids);
	}

	private async request(method: string, path: string, body: unknown): Promise<void> {
		// Call fetch detached, not as `this.fetch(...)`: on workerd the global
		// fetch throws "Illegal invocation" when invoked with `this` bound to a
		// non-global object (which method-call syntax would do). A bare call
		// leaves `this` undefined, which both the runtime fetch and test mocks
		// accept. (Node/undici is lenient, so this only bites in the Worker.)
		const doFetch = this.fetch;
		const res = await doFetch(`${this.base}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${this.apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			// No body/key echoed — it can end up in logs or error pages.
			throw new Error(`Meilisearch ${method} ${path} failed: ${res.status}`);
		}
	}
}

/** PATCH the index settings (and auto-create the index) for a backend. Call
 *  once per worker before the sink starts upserting so the read path's filters
 *  resolve. */
export async function applyMeiliSettings(
	backend: MeiliSinkBackend,
	fetchFn?: typeof fetch
): Promise<void> {
	await new MeiliEventIndex(backend, fetchFn).applySettings();
}

/** Best-effort fill of doc._geo from the geocode_cache. Read-only; a missing
 *  table or D1 hiccup just means "no _geo this pass" (never an ingest failure).
 *  Its real job is to reproduce the _geo the external geocode job wrote, so a
 *  later live UPDATE (full-doc PUT) of an already-geocoded event doesn't drop it. */
async function fillGeoFromCache(
	db: D1Database | null,
	pending: { doc: SearchDoc; norm: string }[]
): Promise<void> {
	if (!db || pending.length === 0) return;
	try {
		const norms = [...new Set(pending.map((p) => p.norm))];
		const placeholders = norms.map(() => '?').join(',');
		const { results } = await db
			.prepare(
				`SELECT address_norm, lat, lng FROM geocode_cache WHERE lat IS NOT NULL AND address_norm IN (${placeholders})`
			)
			.bind(...norms)
			.all<{ address_norm: string; lat: number; lng: number }>();
		const byNorm = new Map(results.map((r) => [r.address_norm, r]));
		for (const { doc, norm } of pending) {
			const row = byNorm.get(norm);
			if (row) doc._geo = { lat: row.lat, lng: row.lng };
		}
	} catch (e) {
		console.warn('[search-sink] geocode cache lookup failed; indexing without _geo:', e);
	}
}

/** Builds the contrail Sink. The backend is resolved lazily per batch via
 *  `getBackend` because a Cloudflare Worker only has env per invocation, while
 *  `contrail` is constructed once at module load — the cron/xrpc handlers set
 *  the backend (see $lib/contrail/index.ts) before ingest fires the sink. When
 *  the backend is null (unconfigured), onRecords is a no-op. */
export function createMeiliSink(
	getBackend: () => MeiliSinkBackend | null,
	getDb: () => D1Database | null = () => null,
	fetchFn?: typeof fetch
): Sink {
	// Apply the read-path's filterable/sortable settings once, before the first
	// write. Otherwise a fresh-rollout `pnpm backfill` (or reindex) lets PUT
	// /documents auto-create a bare index whose _geo/startsAt filtered searches
	// 400. Only flip the flag on success, so a transient Meili outage retries
	// next batch instead of permanently disabling the sink in the Worker.
	let settingsApplied = false;
	return {
		async onRecords(events: RecordEvent[]): Promise<void> {
			const backend = getBackend();
			if (!backend) return;

			const docs: SearchDoc[] = [];
			const deletes: string[] = [];
			// Docs that have no coordinate _geo but do carry an address — candidates
			// for a geocode_cache fill.
			const pending: { doc: SearchDoc; norm: string }[] = [];
			for (const e of events) {
				if (e.collection !== EVENT_COLLECTION) continue;
				// Discoverability is decided by the shared predicate (discoverability.ts)
				// so this in-memory filter and the D1 SQL filter never diverge.
				// Index discoverable creates; for everything else — real deletes AND
				// events hidden from discovery — remove the doc so the search index
				// never holds a hidden event's name/description and a discoverable→
				// unlisted flip purges the existing entry.
				if (e.kind === 'created' && !isHiddenFromDiscovery(e.record)) {
					const doc = eventToSearchDoc({
						uri: e.uri,
						did: e.did,
						collection: e.collection,
						rkey: e.rkey,
						record: e.record
					});
					docs.push(doc);
					if (!doc._geo) {
						const loc = addressLocation(e.record);
						const norm = loc ? normalizeAddress(loc) : null;
						if (norm) pending.push({ doc, norm });
					}
				} else {
					deletes.push(searchDocId(e.uri));
				}
			}

			// Mutates doc._geo in place before the upsert below.
			await fillGeoFromCache(getDb(), pending);

			if (docs.length === 0 && deletes.length === 0) return;

			const index = new MeiliEventIndex(backend, fetchFn);
			if (!settingsApplied) {
				await index.applySettings();
				settingsApplied = true;
			}
			// Order doesn't matter across upsert/remove within a batch: a given uri
			// is deduplicated to a single RecordEvent, so it's either a create or a
			// delete, never both.
			await Promise.all([index.upsert(docs), index.remove(deletes)]);
		}
	};
}
