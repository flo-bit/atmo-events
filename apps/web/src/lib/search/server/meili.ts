// Read-only Meilisearch query client for the event search read path.
// Only `search` and `near-me` talk to Meilisearch; every other read stays on
// D1. Auth is the instance's auto-derived Default Search API Key — the Worker
// never holds the admin or root key. Doc shape is written by the search sink
// in ./meili-sink.ts (uri + _geo per event record).

export interface SearchBackend {
	url: string;
	apiKey: string;
	indexUid?: string;
	fetch?: typeof fetch;
}

export interface SearchHit {
	uri: string;
	/** Present on near-me hits: meters from the query point (_geoDistance). */
	distanceMeters?: number;
}

export interface SearchResult {
	hits: SearchHit[];
	estimatedTotalHits: number;
}

interface MeiliHit {
	uri?: unknown;
	_geoDistance?: unknown;
}

async function querySearchIndex(
	backend: SearchBackend,
	body: Record<string, unknown>
): Promise<SearchResult> {
	const base = backend.url.replace(/\/+$/, '');
	const indexUid = backend.indexUid ?? 'events';
	const fetchFn = backend.fetch ?? globalThis.fetch;

	const res = await fetchFn(`${base}/indexes/${indexUid}/search`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${backend.apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		// No body/key in the message — it can end up in logs or error pages.
		throw new Error(`search request failed: ${res.status}`);
	}

	const data = (await res.json()) as { hits?: MeiliHit[]; estimatedTotalHits?: number };
	const hits: SearchHit[] = (data.hits ?? [])
		.filter((h): h is MeiliHit & { uri: string } => typeof h.uri === 'string')
		.map((h) => ({
			uri: h.uri,
			...(typeof h._geoDistance === 'number' ? { distanceMeters: h._geoDistance } : {})
		}));
	return { hits, estimatedTotalHits: data.estimatedTotalHits ?? hits.length };
}

/** Filter clause restricting to events that haven't ended yet: the bound is on
 *  endsAt, since an event is still "upcoming" while it is running; events with
 *  no endsAt fall back to startsAt. Meilisearch range-compares the ISO-8601 UTC
 *  strings chronologically (verified live, v1.46.1); EXISTS/NOT EXISTS gate the
 *  fallback. Matches the endsAt||startsAt>=now rule the in-memory surfaces use.
 *
 *  THE "UTC" IN THAT SENTENCE IS AN INVARIANT THIS FILE DEPENDS ON AND DOES NOT
 *  ESTABLISH. Meilisearch has no date type, so every bound below is a STRING
 *  comparison, and text order is chronological order only while both sides are
 *  written the same way. `now` is a toISOString(); the indexed side is made to
 *  match by `utcInstant` in ./normalize.ts, which is where an offset-bearing
 *  RFC 3339 timestamp (the importers preserve them) is resolved to its instant.
 *  Change one side and the other has to move with it. */
function upcomingFilter(now: string): string {
	return `(endsAt >= "${now}" OR (endsAt NOT EXISTS AND startsAt >= "${now}"))`;
}

export async function searchEvents(
	backend: SearchBackend,
	{
		q,
		limit,
		offset,
		now = new Date().toISOString()
	}: { q: string; limit: number; offset: number; now?: string }
): Promise<SearchResult> {
	return querySearchIndex(backend, {
		q,
		limit,
		offset,
		filter: upcomingFilter(now),
		attributesToRetrieve: ['uri']
	});
}

/** Filter clause restricting to events UNDER WAY: started, and not yet ended.
 *
 *  There is no missing-endsAt fallback here, and its absence is the rule rather
 *  than an oversight in it. An event with no endsAt is treated everywhere in this
 *  app as over once it has started (`hasEnded`, $lib/past-events), so it can never
 *  be ongoing — the records this bound excludes are exactly the ones that have no
 *  answer to "is it still on?". Same reasoning as the D1 band, which gets the
 *  exclusion for free from SQL's `NULL >= 'x'`.
 *
 *  Both bounds are string comparisons against a UTC `now` — see upcomingFilter
 *  above for the normalization that makes that chronological. This clause is the
 *  one most exposed to it: it is bounded on BOTH sides, so a timestamp compared
 *  by its wall-clock digits can fall outside a window it is genuinely inside. */
function ongoingFilter(now: string): string {
	return `(startsAt <= "${now}" AND endsAt >= "${now}")`;
}

/**
 * The happening-now band, ranked by the search backend.
 *
 * Exists so a TERM-SCOPED band and the page its "see all" links to run the same
 * query on the same backend. The band on /search sits beside a Meili-ranked list
 * and promotes any live event out of it; a D1-only destination cannot contain
 * what Meili ranked and D1 did not, so "see all" led to a smaller list than the
 * block it was offered beside.
 */
export async function ongoingEvents(
	backend: SearchBackend,
	{
		q,
		limit,
		offset,
		now = new Date().toISOString()
	}: { q: string; limit: number; offset: number; now?: string }
): Promise<SearchResult> {
	return querySearchIndex(backend, {
		q,
		limit,
		offset,
		filter: ongoingFilter(now),
		// Soonest-ENDING first, overriding relevance ON PURPOSE and matching the D1
		// band. For "what is on right now", when it ends is what decides whether a
		// reader can still get to it; how well it matched the term does not.
		sort: ['endsAt:asc'],
		attributesToRetrieve: ['uri']
	});
}

export async function nearMeEvents(
	backend: SearchBackend,
	{
		lat,
		lng,
		radiusMeters,
		limit,
		offset,
		now = new Date().toISOString()
	}: {
		lat: number;
		lng: number;
		radiusMeters: number;
		limit: number;
		offset: number;
		/** ISO-8601 UTC instant the "upcoming" bound is measured against;
		 *  injectable for deterministic tests. */
		now?: string;
	}
): Promise<SearchResult> {
	if (![lat, lng, radiusMeters].every(Number.isFinite)) {
		throw new Error('invalid coordinates');
	}
	// No attributesToRetrieve here: restricting it makes Meilisearch drop the
	// computed _geoDistance from hits (observed live), and the distance is the
	// whole point of this query. Docs are small; the overfetch cost is fine.
	return querySearchIndex(backend, {
		q: '',
		filter: `_geoRadius(${lat}, ${lng}, ${radiusMeters}) AND ${upcomingFilter(now)}`,
		sort: [`_geoPoint(${lat}, ${lng}):asc`],
		limit,
		offset
	});
}
