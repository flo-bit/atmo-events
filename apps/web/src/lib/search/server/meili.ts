// Read-only Meilisearch query client for the event search read path.
// Only `search` and `near-me` talk to Meilisearch; every other read stays on
// D1. Auth is the instance's auto-derived Default Search API Key — the Worker
// never holds the admin or root key. Doc shape is written by the
// openmeet-contrail search sink (uri + _geo per event record).

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

async function querySearchIndex(backend: SearchBackend, body: Record<string, unknown>): Promise<SearchResult> {
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

export async function searchEvents(
	backend: SearchBackend,
	{ q, limit, offset }: { q: string; limit: number; offset: number }
): Promise<SearchResult> {
	return querySearchIndex(backend, {
		q,
		limit,
		offset,
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
		offset
	}: { lat: number; lng: number; radiusMeters: number; limit: number; offset: number }
): Promise<SearchResult> {
	if (![lat, lng, radiusMeters].every(Number.isFinite)) {
		throw new Error('invalid coordinates');
	}
	return querySearchIndex(backend, {
		q: '',
		filter: `_geoRadius(${lat}, ${lng}, ${radiusMeters})`,
		sort: [`_geoPoint(${lat}, ${lng}):asc`],
		limit,
		offset,
		attributesToRetrieve: ['uri']
	});
}
