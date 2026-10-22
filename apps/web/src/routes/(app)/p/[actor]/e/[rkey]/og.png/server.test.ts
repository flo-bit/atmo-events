import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testBucket, testDb } from '$lib/server/og/testing';

vi.mock('$lib/contrail/index', () => ({
	getServerClient: vi.fn(() => ({}))
}));
vi.mock('$lib/contrail', () => ({
	getEventRecordFromContrail: vi.fn(),
	flattenEventRecord: vi.fn()
}));
vi.mock('$lib/actor', () => ({ getActor: vi.fn() }));
vi.mock('@atmo-dev/events-ui', () => ({
	formatInTz: (date: string, _tz: string | undefined, opts: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(date)),
	partsInTz: (date: string, _tz: string | undefined, opts: Intl.DateTimeFormatOptions) =>
		Object.fromEntries(
			new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
				.formatToParts(new Date(date))
				.map((part) => [part.type, part.value])
		)
}));

import { GET, HEAD } from './+server';
import { getActor } from '$lib/actor';
import { getEventRecordFromContrail, flattenEventRecord } from '$lib/contrail';
import { imageVersion } from '$lib/server/og/cache';

const mockGetActor = vi.mocked(getActor);
const mockGetEventRecord = vi.mocked(getEventRecordFromContrail);
const mockFlatten = vi.mocked(flattenEventRecord);
function flat(overrides: Record<string, unknown> = {}) {
	return {
		name: 'Rust Meetup',
		startsAt: '2026-08-01T18:00:00.000Z',
		timezone: 'America/New_York',
		rkey: 'rk-123',
		did: 'did:plc:alice',
		uri: 'at://did:plc:alice/community.lexicon.calendar.event/rk-123',
		cid: 'bafyreiabc123',
		media: [],
		...overrides
	} as unknown as NonNullable<ReturnType<typeof flattenEventRecord>>;
}
let database: ReturnType<typeof testDb>;
let storage: ReturnType<typeof testBucket>;
const staticPng = readFileSync('static/og.png');
function evt(
	opts: {
		actor?: string;
		rkey?: string;
		ifNoneMatch?: string;
		method?: string;
		disabled?: boolean;
	} = {}
) {
	const actor = opts.actor ?? 'alice.test';
	const rkey = opts.rkey ?? 'rk-123';
	const url = new URL(`https://atmo.test/p/${actor}/e/${rkey}/og.png`);
	const request = new Request(url, {
		method: opts.method ?? 'GET',
		headers: opts.ifNoneMatch ? { 'If-None-Match': opts.ifNoneMatch } : undefined
	});
	return {
		params: { actor, rkey },
		url,
		request,
		platform: {
			env: {
				DB: database.db,
				OG_IMAGES: storage.bucket,
				OG_DAILY_GENERATION_LIMIT: opts.disabled ? '0' : '20',
				ASSETS: {
					fetch: vi.fn(
						async (request: Request) =>
							new Response(request.method === 'HEAD' ? null : staticPng, {
								headers: {
									'Content-Type': 'image/png',
									ETag: '"static"',
									'Cache-Control': 'immutable'
								}
							})
					)
				}
			}
		}
	} as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
	database = testDb();
	storage = testBucket();
	mockGetActor.mockResolvedValue('did:plc:alice');
	mockGetEventRecord.mockResolvedValue(
		{} as Awaited<ReturnType<typeof getEventRecordFromContrail>>
	);
	mockFlatten.mockReturnValue(flat());
});
afterEach(() => {
	database.sqlite.close();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('event OG route', () => {
	it('consumes a real 1200×630 PNG, persists it, and serves identical cached bytes', async () => {
		const network = vi.spyOn(globalThis, 'fetch');
		const res = await GET(evt());
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('cache-control')).toBe(
			'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
		);
		expect(res.headers.get('etag')).toMatch(/^W\/"v3-/);
		// Unlike the old test, await the renderer's entire stream and inspect PNG.
		const png = await res.arrayBuffer();
		expect([...new Uint8Array(png).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		const view = new DataView(png);
		expect(view.getUint32(16)).toBe(1200);
		expect(view.getUint32(20)).toBe(630);
		expect(png.byteLength).toBeGreaterThan(1000);
		expect(storage.objects.size).toBe(1);
		expect(network.mock.calls.some(([url]) => String(url).includes('NotoSans'))).toBe(false);
		expect(await (await GET(evt())).arrayBuffer()).toEqual(png);
		expect(
			database.sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()
				?.daily_attempts
		).toBe(1);
	}, 30000);

	it('renders a large thumbnail quickly from JPEG CDN variants', async () => {
		// Inlined as base64 into the old Satori markup, an image this size took
		// tens of seconds of CPU to parse. Takumi receives the raw bytes.
		const jpeg = readFileSync('static/topics/sustainability.jpg');
		const cdn = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(
				async () => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } })
			);
		mockFlatten.mockReturnValue(
			flat({
				media: [{ role: 'thumbnail', content: { $type: 'blob', ref: { $link: 'bafkthumb' } } }]
			})
		);
		const started = performance.now();
		const res = await GET(evt());
		const png = await res.arrayBuffer();
		expect(performance.now() - started).toBeLessThan(5000);
		expect(res.headers.get('x-og-fallback')).toBeNull();
		expect([...new Uint8Array(png).slice(0, 4)]).toEqual([137, 80, 78, 71]);
		expect(cdn.mock.calls.map(([url]) => String(url)).sort()).toEqual([
			'https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:alice/bafkthumb@jpeg',
			'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:alice/bafkthumb@jpeg'
		]);
	}, 30000);

	it('renders the generated-avatar card without network access', async () => {
		const network = vi.spyOn(globalThis, 'fetch');
		const res = await GET(evt());
		const png = await res.arrayBuffer();
		expect(res.headers.get('x-og-fallback')).toBeNull();
		const view = new DataView(png);
		expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
		expect(network).not.toHaveBeenCalled();
	}, 30000);

	it('renders HTML in an event name as text, never as markup', async () => {
		const network = vi.spyOn(globalThis, 'fetch');
		mockFlatten.mockReturnValue(flat({ name: '<img src="https://evil.test/x"> & <b>bold</b>' }));
		const res = await GET(evt());
		await res.arrayBuffer();
		expect(res.headers.get('x-og-fallback')).toBeNull();
		expect(network).not.toHaveBeenCalled();
	}, 30000);

	it('returns 304 for matching validators without rendering or spending budget', async () => {
		const { etag } = await imageVersion('did:plc:alice', flat());
		for (const validator of [etag, etag.replace('W/', ''), '"old", ' + etag, '*']) {
			const res = await GET(evt({ ifNoneMatch: validator }));
			expect(res.status).toBe(304);
			expect(res.body).toBeNull();
		}
		expect(storage.objects.size).toBe(0);
		expect(
			database.sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()
				?.daily_attempts
		).toBe(0);
	});

	it('uses a short-lived static preview when disabled, without an event ETag', async () => {
		const res = await GET(evt({ disabled: true, ifNoneMatch: '"old-event"' }));
		expect(res.status).toBe(200);
		expect(res.headers.get('x-og-fallback')).toBe('1');
		expect(res.headers.get('etag')).toBeNull();
		expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
		expect(Buffer.from(await res.arrayBuffer())).toEqual(staticPng);
		expect(storage.objects.size).toBe(0);
	});

	it('HEAD does not generate a PNG on a miss', async () => {
		const res = await HEAD(evt({ method: 'HEAD' }));
		expect(res.status).toBe(200);
		expect(res.body).toBeNull();
		expect(storage.objects.size).toBe(0);
		expect(
			database.sqlite.prepare('SELECT daily_attempts FROM og_generation_budget').get()
				?.daily_attempts
		).toBe(0);
	});

	it('event edits get a different storage key without making the public URL immutable', async () => {
		const before = await imageVersion('did:plc:alice', flat());
		const after = await imageVersion('did:plc:alice', flat({ cid: 'new-cid' }));
		expect(after.key).not.toBe(before.key);
		storage.objects.set(
			after.key,
			staticPng.buffer.slice(staticPng.byteOffset, staticPng.byteOffset + staticPng.byteLength)
		);
		mockFlatten.mockReturnValue(flat({ cid: 'new-cid' }));
		const res = await GET(evt({ ifNoneMatch: before.etag }));
		expect(res.status).toBe(200);
		expect(res.headers.get('etag')).toBe(after.etag);
		expect(res.headers.get('cache-control')).not.toContain('immutable');
	});

	it('404s an unknown actor before touching contrail', async () => {
		mockGetActor.mockResolvedValue(null);
		await expect(GET(evt())).rejects.toThrow();
		expect(mockGetEventRecord).not.toHaveBeenCalled();
	});
	it('404s a missing event', async () => {
		mockGetEventRecord.mockResolvedValue(
			null as Awaited<ReturnType<typeof getEventRecordFromContrail>>
		);
		await expect(GET(evt())).rejects.toThrow();
	});
});
