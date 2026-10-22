import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageVersion, MAX_PNG_BYTES, serveOgImage, type OgImageOptions } from './cache';
import { testBucket, testDb, tinyPng } from './testing';

const databases: ReturnType<typeof testDb>[] = [];
function setup() {
	const database = testDb();
	databases.push(database);
	const { bucket, objects } = testBucket();
	const options: OgImageOptions = {
		env: { DB: database.db, OG_IMAGES: bucket },
		key: 'og/v3/image.png',
		etag: 'W/"v3-image"',
		request: new Request('https://atmo.test/p/alice/e/event/og.png'),
		render: vi.fn(async () => tinyPng.slice(0)),
		fallback: vi.fn(async () => new Response('static', { headers: { 'X-OG-Fallback': '1' } }))
	};
	return { options, bucket, objects, ...database };
}
afterEach(() => {
	for (const { sqlite } of databases.splice(0)) sqlite.close();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('versioned OG read-through storage', () => {
	it('persists bytes and serves repeated unconditional requests without rendering again', async () => {
		const { options, objects } = setup();
		const first = await serveOgImage(options);
		expect(await first.arrayBuffer()).toEqual(tinyPng);
		expect(objects.get(options.key)).toEqual(tinyPng);
		const second = await serveOgImage(options);
		expect(await second.arrayBuffer()).toEqual(tinyPng);
		expect(options.render).toHaveBeenCalledTimes(1);
		expect(second.headers.get('cache-control')).not.toContain('immutable');
	});

	it('coalesces simultaneous local misses and gives each caller its own response', async () => {
		const { options } = setup();
		const results = await Promise.all(Array.from({ length: 12 }, () => serveOgImage(options)));
		expect(options.render).toHaveBeenCalledTimes(1);
		for (const response of results) expect(await response.arrayBuffer()).toEqual(tinyPng);
	});

	it('uses the D1 lease even when in-memory maps are not shared', async () => {
		const { options, objects } = setup();
		let finish!: (bytes: ArrayBuffer) => void;
		options.render = vi.fn(
			() =>
				new Promise<ArrayBuffer>((resolve) => {
					finish = resolve;
				})
		);
		const first = serveOgImage(options);
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		const otherIsolate = {
			...options,
			env: { ...options.env, OG_IMAGES: testBucket(objects).bucket }
		};
		const concurrent = await serveOgImage(otherIsolate);
		expect(concurrent.headers.get('x-og-fallback')).toBe('1');
		expect(options.render).toHaveBeenCalledTimes(1);
		finish(tinyPng);
		expect((await first).status).toBe(200);
	});

	it('waits for PUT before serving bytes, and does not rerender when persistence fails', async () => {
		const { options, bucket, sqlite } = setup();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(bucket, 'put').mockRejectedValue(new Error('R2 unavailable'));
		expect((await serveOgImage(options)).headers.get('x-og-fallback')).toBe('1');
		expect((await serveOgImage(options)).headers.get('x-og-fallback')).toBe('1');
		expect(options.render).toHaveBeenCalledTimes(1);
		expect(
			sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()?.daily_attempts
		).toBe(1);
	});

	it('serves cached versions even after the generation quota is exhausted', async () => {
		const { options } = setup();
		options.env.OG_DAILY_GENERATION_LIMIT = '1';
		await serveOgImage(options);
		expect(
			(await serveOgImage({ ...options, key: 'different' })).headers.get('x-og-fallback')
		).toBe('1');
		expect(await (await serveOgImage(options)).arrayBuffer()).toEqual(tinyPng);
		expect(options.render).toHaveBeenCalledTimes(1);
	});

	it('falls back without rendering for missing bindings/schema and cache outages', async () => {
		const { options, bucket, sqlite } = setup();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(
			(await serveOgImage({ ...options, env: { DB: options.env.DB } })).headers.get('x-og-fallback')
		).toBe('1');
		sqlite.exec('DROP TABLE og_generation_budget');
		expect((await serveOgImage(options)).headers.get('x-og-fallback')).toBe('1');
		vi.spyOn(bucket, 'get').mockRejectedValue(new Error('read failed'));
		expect((await serveOgImage(options)).headers.get('x-og-fallback')).toBe('1');
		expect(options.render).not.toHaveBeenCalled();
	});

	it('does not render on HEAD or matching conditional GET', async () => {
		const { options, objects } = setup();
		const head = new Request(options.request, { method: 'HEAD' });
		await serveOgImage({ ...options, request: head });
		objects.set(options.key, tinyPng);
		expect((await serveOgImage({ ...options, request: head })).body).toBeNull();
		for (const validator of [
			options.etag,
			options.etag.replace('W/', ''),
			'"other", ' + options.etag,
			'*'
		]) {
			const result = await serveOgImage({
				...options,
				request: new Request(options.request, {
					headers: { 'If-None-Match': validator }
				})
			});
			expect(result.status).toBe(304);
			expect(result.body).toBeNull();
		}
		expect(options.render).not.toHaveBeenCalled();
	});

	it('rejects oversized/invalid rendered bytes and retains a failure cooldown', async () => {
		const { options, objects } = setup();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		options.render = vi.fn(async () => new ArrayBuffer(MAX_PNG_BYTES + 1));
		expect((await serveOgImage(options)).headers.get('x-og-fallback')).toBe('1');
		expect(objects.size).toBe(0);
		options.render = vi.fn(async () => new TextEncoder().encode('not png').buffer);
		expect((await serveOgImage({ ...options, key: 'invalid' })).headers.get('x-og-fallback')).toBe(
			'1'
		);
		expect(objects.size).toBe(0);
	});

	it('keeps immutable edge-cache headers internal and bypasses rendering on edge hits', async () => {
		const { options } = setup();
		await serveOgImage(options);
		const entries = new Map<string, Response>();
		const cache = {
			match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
			put: vi.fn(async (key: Request, value: Response) => {
				entries.set(key.url, value.clone());
			})
		};
		vi.stubGlobal('caches', { default: cache });
		const fromR2 = await serveOgImage(options);
		expect(await fromR2.arrayBuffer()).toEqual(tinyPng);
		expect([...entries.values()][0].headers.get('cache-control')).toBe('public, max-age=86400');
		vi.spyOn(options.env.OG_IMAGES!, 'get').mockRejectedValue(new Error('should not read R2'));
		const fromEdge = await serveOgImage(options);
		expect(await fromEdge.arrayBuffer()).toEqual(tinyPng);
		expect(fromEdge.headers.get('cache-control')).toContain('max-age=300');
		expect(fromEdge.headers.get('cache-control')).not.toContain('max-age=86400');
		expect(options.render).toHaveBeenCalledTimes(1);
	});

	it('versions by DID/rkey/CID/template, and uses complete content when CID is absent', async () => {
		const event = { cid: 'cid-A', rkey: 'one', name: 'Meetup', startsAt: '2026-10-12T12:00:00Z' };
		const first = await imageVersion('did:plc:alice', event);
		expect(first.key).toMatch(/^og\/v3\/[0-9a-f]{64}\.png$/);
		expect(await imageVersion('did:plc:alice', event)).toEqual(first);
		for (const changed of [
			{ ...event, cid: 'cid-B' },
			{ ...event, rkey: 'two' }
		]) {
			expect(await imageVersion('did:plc:alice', changed)).not.toEqual(first);
		}
		expect(await imageVersion('did:plc:bob', event)).not.toEqual(first);
		const noCid = { ...event, cid: null };
		const version = await imageVersion('did:plc:alice', noCid);
		for (const changed of [
			{ ...noCid, name: 'Renamed' },
			{ ...noCid, timezone: 'Asia/Tokyo' },
			{ ...noCid, startsAt: '2026-10-13T12:00:00Z' },
			{ ...noCid, media: [{ content: 'new' }] }
		])
			expect(await imageVersion('did:plc:alice', changed)).not.toEqual(version);
	});
});
