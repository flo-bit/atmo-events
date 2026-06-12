// Search sink: the write half of the Meilisearch search path. Implements the
// contrail `Sink` seam (flo-bit/contrail#54) — a write-only, post-commit
// observer that contrail invokes after every applyEvents() commit, on both the
// live (jetstream / notify) and backfill paths. We forward calendar-event
// records into the Meilisearch `events` index that ./meili.ts reads from, so
// atmo's own in-process cron ingest indexes search WITHOUT a separate
// standalone indexer (replacing openmeet-contrail's role here).
//
// Constraints inherited from the seam:
//   - sinks only ever observe PUBLIC records (space-scoped/private records
//     never reach applyEvents), so there's no `space` to skip — unlike the old
//     realtime-pubsub masquerade this supersedes;
//   - a thrown sink is caught and logged by contrail and never blocks ingest,
//     so a Meilisearch outage degrades to "search index falls behind", not
//     "ingest stops".
import { eventToSearchDoc, searchDocId, type SearchDoc } from './normalize';
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
	/** Index uid override; defaults to `events` (what ./meili.ts reads). */
	SEARCH_SINK_INDEX?: string;
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
		indexUid: env.SEARCH_SINK_INDEX
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
			filterableAttributes: ['_geo', 'startsAt', 'endsAt', 'status', 'mode', 'did', 'locationTypes'],
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
		const res = await this.fetch(`${this.base}${path}`, {
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

/** Builds the contrail Sink. The backend is resolved lazily per batch via
 *  `getBackend` because a Cloudflare Worker only has env per invocation, while
 *  `contrail` is constructed once at module load — the cron/xrpc handlers set
 *  the backend (see $lib/contrail/index.ts) before ingest fires the sink. When
 *  the backend is null (unconfigured), onRecords is a no-op. */
export function createMeiliSink(
	getBackend: () => MeiliSinkBackend | null,
	fetchFn?: typeof fetch
): Sink {
	return {
		async onRecords(events: RecordEvent[]): Promise<void> {
			const backend = getBackend();
			if (!backend) return;

			const docs: SearchDoc[] = [];
			const deletes: string[] = [];
			for (const e of events) {
				if (e.collection !== EVENT_COLLECTION) continue;
				if (e.kind === 'created') {
					docs.push(
						eventToSearchDoc({
							uri: e.uri,
							did: e.did,
							collection: e.collection,
							rkey: e.rkey,
							record: e.record
						})
					);
				} else {
					deletes.push(searchDocId(e.uri));
				}
			}
			if (docs.length === 0 && deletes.length === 0) return;

			const index = new MeiliEventIndex(backend, fetchFn);
			// Order doesn't matter across upsert/remove within a batch: a given uri
			// is deduplicated to a single RecordEvent, so it's either a create or a
			// delete, never both.
			await Promise.all([index.upsert(docs), index.remove(deletes)]);
		}
	};
}
