/**
 * Read-through edge cache backed by the Cloudflare Cache API (`caches.default`).
 *
 * Use for reads whose result is identical for every visitor (global discovery
 * lists, global activity feeds) so we serve them from the colo cache instead of
 * re-querying D1 on every request. A hit skips both the DB round-trips AND any
 * post-processing folded into `fn`.
 *
 * `caches.default` is a Cloudflare extension absent in dev (vite/node) — when
 * it's missing we degrade to calling `fn` directly (no caching), so dev behaves
 * like a permanent cache miss.
 *
 * Freshness is governed by the stored `Cache-Control: max-age`; once it expires
 * the Workers Cache API treats the entry as a miss, so there's no manual TTL
 * bookkeeping. Only non-null values are cached, so a failed/empty read isn't
 * pinned as a negative result.
 */
function getEdgeCache(): Cache | null {
	return typeof caches !== 'undefined' && 'default' in caches
		? (caches as unknown as { default: Cache }).default
		: null;
}

export async function cachedRead<T>(
	key: string,
	ttlSeconds: number,
	fn: () => Promise<T>
): Promise<T> {
	const cache = getEdgeCache();
	// The host is irrelevant — it only namespaces keys within this colo's cache.
	const cacheKey = new Request(`https://edge-cache.internal/${key}`);

	if (cache) {
		const hit = await cache.match(cacheKey);
		if (hit) return (await hit.json()) as T;
	}

	const value = await fn();

	if (cache && value != null) {
		await cache.put(
			cacheKey,
			new Response(JSON.stringify(value), {
				headers: { 'cache-control': `max-age=${ttlSeconds}` }
			})
		);
	}

	return value;
}
