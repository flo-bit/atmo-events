import { claimGeneration, pruneExpiredLeases, releaseGeneration, type OgBudgetEnv } from './budget';

// Bump whenever layout, fonts, date formatting or image selection changes.
export const OG_TEMPLATE_VERSION = 'v3';
export const OG_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
export const MAX_PNG_BYTES = 2 * 1024 * 1024;

export interface OgCacheEnv extends OgBudgetEnv {
	OG_IMAGES?: R2Bucket;
}

/** SHA-256 avoids collisions in both storage keys and null-CID validators. */
export async function imageVersion(
	did: string,
	event: {
		cid?: string | null;
		rkey: string;
		name: string;
		startsAt: string;
		timezone?: string | null;
		media?: unknown;
	}
) {
	const basis = JSON.stringify([
		OG_TEMPLATE_VERSION,
		did,
		event.rkey,
		event.cid ?? [event.name, event.startsAt, event.timezone ?? '', event.media ?? null]
	]);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis));
	const hash = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
	return {
		key: `og/${OG_TEMPLATE_VERSION}/${hash}.png`,
		etag: `W/"${OG_TEMPLATE_VERSION}-${hash}"`
	};
}

export function ifNoneMatchSatisfied(header: string | null, etag: string) {
	if (!header) return false;
	if (header.trim() === '*') return true;
	const stripWeak = (value: string) => value.trim().replace(/^W\//, '');
	return header.split(',').some((tag) => stripWeak(tag) === stripWeak(etag));
}

function edgeCache(): Cache | null {
	return typeof caches !== 'undefined' && 'default' in caches
		? (caches as unknown as { default: Cache }).default
		: null;
}

// Fast in-isolate coalescing supplements (never replaces) the durable D1 lease.
const pendingByBucket = new WeakMap<R2Bucket, Map<string, Promise<ArrayBuffer | null>>>();

function response(body: BodyInit | null, request: Request, etag: string) {
	const notModified = ifNoneMatchSatisfied(request.headers.get('if-none-match'), etag);
	return new Response(notModified || request.method === 'HEAD' ? null : body, {
		status: notModified ? 304 : 200,
		headers: { 'Content-Type': 'image/png', 'Cache-Control': OG_CACHE_CONTROL, ETag: etag }
	});
}

export interface OgImageOptions {
	env: OgCacheEnv;
	key: string;
	etag: string;
	request: Request;
	render: () => Promise<ArrayBuffer>;
	fallback: () => Promise<Response>;
	waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Immutable/versioned internal storage, mutable/revalidating public URL.
 * Missing bindings/schema, R2 outages, quota exhaustion and renderer failures
 * fail CLOSED to a static preview. Never silently fall back to uncapped renders.
 */
export async function serveOgImage(options: OgImageOptions): Promise<Response> {
	const { env, key, etag, request, fallback, waitUntil } = options;
	// Only real event images carry this version validator; fallbacks never do.
	// Even after storage eviction, a matching client's bytes remain valid.
	if (ifNoneMatchSatisfied(request.headers.get('if-none-match'), etag)) {
		return response(null, request, etag);
	}
	const bucket = env.OG_IMAGES;
	if (!bucket) return fallback();
	const cache = edgeCache();
	const cacheKey = new Request(`https://atmo.rsvp/__og-cache/${key}`);
	try {
		const hit = await cache?.match(cacheKey);
		if (hit) {
			const result = response(hit.body, request, etag);
			if (!result.body) await hit.body?.cancel();
			return result;
		}
		const stored = await bucket.get(key);
		if (stored) {
			if (stored.size > MAX_PNG_BYTES) {
				await stored.body.cancel();
				return fallback();
			}
			if (
				request.method === 'HEAD' ||
				ifNoneMatchSatisfied(request.headers.get('if-none-match'), etag)
			) {
				await stored.body.cancel();
				return response(null, request, etag);
			}
			const result = response(stored.body, request, etag);
			// The internal entry is versioned. Its long TTL must NOT leak onto the
			// mutable public URL. Cache failure must not discard a good R2 image.
			if (cache) {
				const bytes = result.clone();
				const write = cache
					.put(
						cacheKey,
						new Response(bytes.body, {
							headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }
						})
					)
					.catch(() => {});
				if (waitUntil) waitUntil(write);
				else await write;
			}
			return result;
		}
	} catch (cause) {
		console.error('[og] cache read failed; using static preview', cause);
		return fallback();
	}
	// HEAD requests must not generate images.
	if (request.method === 'HEAD') return fallback();

	let pending = pendingByBucket.get(bucket);
	if (!pending) pendingByBucket.set(bucket, (pending = new Map()));
	let generation = pending.get(key);
	if (!generation) {
		generation = generate(options, bucket);
		pending.set(key, generation);
		void generation.finally(() => pending!.delete(key));
	}
	const bytes = await generation;
	return bytes ? response(bytes, request, etag) : fallback();
}

async function generate(options: OgImageOptions, bucket: R2Bucket): Promise<ArrayBuffer | null> {
	const { env, key, render } = options;
	try {
		const token = await claimGeneration(env, key);
		if (!token) return null;
		// Another isolate could have completed its PUT between our first GET and
		// the claim. R2 is strongly consistent; recheck before expensive rendering.
		const stored = await bucket.get(key);
		if (stored && stored.size > MAX_PNG_BYTES) {
			await stored.body.cancel();
			throw new Error('Stored OG PNG exceeds size limit');
		}
		const bytes = stored ? await stored.arrayBuffer() : await render();
		if (bytes.byteLength > MAX_PNG_BYTES || !isPng(bytes))
			throw new Error('Invalid or oversized OG PNG');
		if (!stored)
			await bucket.put(key, bytes, {
				httpMetadata: { contentType: 'image/png' },
				customMetadata: { template: OG_TEMPLATE_VERSION }
			});
		// PUT must finish before releasing the lease or serving the newly rendered
		// image. No fire-and-forget persistence and no quota refund on failures.
		try {
			await releaseGeneration(env.DB, key, token);
			await pruneExpiredLeases(env.DB);
		} catch (cause) {
			console.error('[og] lease cleanup failed', cause);
		}
		return bytes;
	} catch (cause) {
		console.error('[og] generation failed; using static preview', cause);
		return null;
	}
}

export function isPng(bytes: ArrayBuffer) {
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	const view = new Uint8Array(bytes);
	return signature.every((byte, index) => view[index] === byte);
}
