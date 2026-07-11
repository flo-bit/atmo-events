import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression net for flo-bit/atmo-events#41: the OG image used to be
// served with the library default `public, immutable, no-transform,
// max-age=31536000`, freezing social cards for a year so event edits never
// surfaced. The route now overrides that with a short, revalidating policy plus
// a CID-derived weak ETag, and short-circuits a matching conditional GET to a
// bare 304 with no render.
//
// Mock at the I/O boundary (contrail D1 client + actor resolution), NOT the
// ImageResponse renderer -- the 200 path builds a real PNG response so we're
// asserting the library's actual header-spread behaviour. Precedent:
// src/routes/(app)/topics/[slug]/page.server.test.ts.
vi.mock('$lib/contrail', () => ({
	getServerClient: vi.fn(() => ({})),
	getEventRecordFromContrail: vi.fn(),
	flattenEventRecord: vi.fn()
}));

vi.mock('$lib/actor', () => ({
	getActor: vi.fn()
}));

// +server.ts's only runtime import from the UI package is the date helpers;
// stubbing the barrel keeps plyr's CSS (which Node's ESM loader rejects) out of
// the test graph. Same pattern as src/lib/search/server/query.test.ts. These are
// pure date formatters, NOT the ImageResponse renderer, so the 200 path still
// builds a real PNG.
vi.mock('@atmo-dev/events-ui', () => ({
	formatInTz: (dateStr: string, _tz: string | undefined, opts: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(dateStr)),
	partsInTz: (dateStr: string, _tz: string | undefined, opts: Intl.DateTimeFormatOptions) =>
		Object.fromEntries(
			new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
				.formatToParts(new Date(dateStr))
				.map((p) => [p.type, p.value])
		)
}));

import { GET } from './+server';
import { getActor } from '$lib/actor';
import { getEventRecordFromContrail, flattenEventRecord } from '$lib/contrail';

const mockGetActor = vi.mocked(getActor);
const mockGetEventRecord = vi.mocked(getEventRecordFromContrail);
const mockFlatten = vi.mocked(flattenEventRecord);

type Flat = ReturnType<typeof flattenEventRecord>;

function flat(overrides: Record<string, unknown> = {}): Flat {
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
	} as unknown as Flat;
}

function evt(opts: { actor?: string; rkey?: string; ifNoneMatch?: string } = {}) {
	const actor = opts.actor ?? 'alice.test';
	const rkey = opts.rkey ?? 'rk-123';
	const url = new URL(`https://atmo.test/p/${actor}/e/${rkey}/og.png`);
	const headers = new Headers();
	if (opts.ifNoneMatch) headers.set('If-None-Match', opts.ifNoneMatch);
	return {
		params: { actor, rkey },
		url,
		platform: { env: {} },
		request: new Request(url, { headers })
	} as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
	mockGetActor.mockResolvedValue('did:plc:alice');
	// A truthy record; flattenEventRecord is what actually shapes eventData below.
	mockGetEventRecord.mockResolvedValue(
		{} as Awaited<ReturnType<typeof getEventRecordFromContrail>>
	);
	mockFlatten.mockReturnValue(flat());
});

afterEach(() => vi.clearAllMocks());

describe('og.png cache headers + conditional GET', () => {
	it('serves a short, revalidating Cache-Control -- no immutable, no year-long max-age', async () => {
		const res = await GET(evt());
		expect(res.status).toBe(200);
		const cc = res.headers.get('cache-control');
		expect(cc).not.toMatch(/immutable/);
		expect(cc).not.toContain('max-age=31536000');
		expect(cc).toContain('max-age=300');
		expect(cc).toContain('s-maxage=3600');
		expect(cc).toContain('stale-while-revalidate=86400');
	});

	it('renders a PNG on a cache miss and carries an ETag', async () => {
		const res = await GET(evt());
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('etag')).toBeTruthy();
		// A real ImageResponse body stream (the renderer WAS invoked on the miss).
		expect(res.body).not.toBeNull();
	});

	it('304s an unchanged record on matching If-None-Match, with no body and no render', async () => {
		const first = await GET(evt());
		const etag = first.headers.get('etag');
		expect(etag).toBeTruthy();

		const second = await GET(evt({ ifNoneMatch: etag! }));
		expect(second.status).toBe(304);
		// No body stream: the renderer (ImageResponse) was never constructed.
		expect(second.body).toBeNull();
		expect(second.headers.get('etag')).toBe(etag);
		// The 304 still carries the revalidating policy, not the library default.
		expect(second.headers.get('cache-control')).not.toMatch(/immutable/);
		expect(second.headers.get('cache-control')).toContain('max-age=300');
	});

	it('rolls the ETag when the record CID changes; a stale validator does NOT 304', async () => {
		mockFlatten.mockReturnValue(flat({ cid: 'bafyreiOLD' }));
		const before = await GET(evt());
		const oldEtag = before.headers.get('etag');
		expect(oldEtag).toBe('W/"bafyreiOLD"');

		mockFlatten.mockReturnValue(flat({ cid: 'bafyreiNEW' }));
		const after = await GET(evt());
		expect(after.headers.get('etag')).toBe('W/"bafyreiNEW"');
		expect(after.headers.get('etag')).not.toBe(oldEtag);

		// A scraper holding the OLD etag re-requests the (now-changed) card:
		// weak comparison misses, so it gets fresh bytes, not a 304.
		const stale = await GET(evt({ ifNoneMatch: oldEtag! }));
		expect(stale.status).toBe(200);
		expect(stale.headers.get('content-type')).toBe('image/png');
	});

	it('falls back to a content validator when CID is null, and still 304s', async () => {
		mockFlatten.mockReturnValue(flat({ cid: null }));
		const first = await GET(evt());
		const etag = first.headers.get('etag');
		expect(etag).toBeTruthy();
		expect(etag).not.toMatch(/null/);

		// Unchanged null-CID record still short-circuits.
		const same = await GET(evt({ ifNoneMatch: etag! }));
		expect(same.status).toBe(304);

		// Editing the name rolls the fallback validator.
		mockFlatten.mockReturnValue(flat({ cid: null, name: 'Totally Different Event' }));
		const renamed = await GET(evt());
		expect(renamed.headers.get('etag')).not.toBe(etag);
	});

	it('rolls the null-CID fallback validator when the thumbnail or timezone changes', async () => {
		const thumb = (link: string) => [
			{ role: 'thumbnail', content: { $type: 'blob', ref: { $link: link } } }
		];
		mockFlatten.mockReturnValue(flat({ cid: null, media: thumb('blobA') }));
		const base = await GET(evt());
		const baseEtag = base.headers.get('etag');
		expect(baseEtag).toBeTruthy();

		// A new thumbnail changes the rendered card, so the validator must roll.
		mockFlatten.mockReturnValue(flat({ cid: null, media: thumb('blobB') }));
		const rethumbed = await GET(evt());
		expect(rethumbed.headers.get('etag')).not.toBe(baseEtag);

		// Timezone sets the date line, so a timezone-only edit must roll it too.
		mockFlatten.mockReturnValue(flat({ cid: null, media: thumb('blobA'), timezone: 'Asia/Tokyo' }));
		const retz = await GET(evt());
		expect(retz.headers.get('etag')).not.toBe(baseEtag);
	});

	it('404s for an unknown actor before touching contrail', async () => {
		mockGetActor.mockResolvedValue(null);
		await expect(GET(evt())).rejects.toThrow();
		expect(mockGetEventRecord).not.toHaveBeenCalled();
	});

	it('404s when the event record is missing', async () => {
		mockGetEventRecord.mockResolvedValue(
			null as Awaited<ReturnType<typeof getEventRecordFromContrail>>
		);
		await expect(GET(evt())).rejects.toThrow();
	});
});
