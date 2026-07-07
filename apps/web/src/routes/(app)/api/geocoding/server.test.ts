import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
import { DEFAULT_GEOCODER_URL, DEFAULT_GEOCODER_USER_AGENT } from '$lib/search/server/geocoder';

const louisville = [
	{
		lat: '38.2542',
		lon: '-85.7594',
		display_name: 'Louisville, Jefferson County, Kentucky, United States',
		addresstype: 'city',
		osm_type: 'relation',
		osm_id: 207611,
		address: { city: 'Louisville', state: 'Kentucky', country: 'United States' }
	}
];

function fakeFetch(status: number, body: unknown) {
	const calls: { url: string; headers: Record<string, string> }[] = [];
	const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			headers: Object.fromEntries(new Headers(init?.headers).entries())
		});
		return new Response(JSON.stringify(body), { status });
	});
	return { fn: fn as unknown as typeof fetch, calls };
}

// Minimal RequestEvent shape the handler actually reads.
function event(opts: {
	q?: string | null;
	did?: string | null;
	fetch: typeof fetch;
	env?: Record<string, string>;
}) {
	const url = new URL('https://atmo.rsvp/api/geocoding');
	if (opts.q != null) url.searchParams.set('q', opts.q);
	return {
		url,
		locals: { did: opts.did ?? null },
		platform: { env: opts.env ?? {} },
		fetch: opts.fetch
	} as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/geocoding', () => {
	it('rejects an unauthenticated request (auth gate kept)', async () => {
		const { fn } = fakeFetch(200, louisville);
		const res = await GET(event({ q: 'Louisville', did: null, fetch: fn }));
		expect(res.status).toBe(401);
		expect(fn).not.toHaveBeenCalled();
	});

	it('rejects a missing query', async () => {
		const { fn } = fakeFetch(200, louisville);
		const res = await GET(event({ q: null, did: 'did:plc:abc', fetch: fn }));
		expect(res.status).toBe(400);
	});

	it('returns a normalized {lat,lng,label,...} shape, not the raw upstream object', async () => {
		const { fn, calls } = fakeFetch(200, louisville);
		const res = await GET(event({ q: 'Louisville, KY', did: 'did:plc:abc', fetch: fn }));
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			lat: number;
			lng: number;
			label: string;
			address: Record<string, string>;
			lon?: unknown;
			display_name?: unknown;
		};

		// Normalized numeric coords + label; no raw upstream `lon`/`display_name` leak.
		expect(body.lat).toBe(38.2542);
		expect(body.lng).toBe(-85.7594);
		expect(body.label).toBe('Louisville, Jefferson County, Kentucky, United States');
		expect(body.address).toEqual({
			city: 'Louisville',
			state: 'Kentucky',
			country: 'United States'
		});
		expect(body.lon).toBeUndefined();
		expect(body.display_name).toBeUndefined();

		// Goes through the one shared client: shared URL + shared User-Agent.
		expect(calls[0].url).toContain(DEFAULT_GEOCODER_URL);
		expect(calls[0].headers['user-agent']).toBe(DEFAULT_GEOCODER_USER_AGENT);
	});

	it('appends the key server-side when GEOCODER_URL/KEY are configured', async () => {
		const { fn, calls } = fakeFetch(200, louisville);
		const res = await GET(
			event({
				q: 'Berlin',
				did: 'did:plc:abc',
				fetch: fn,
				env: { GEOCODER_URL: 'https://us1.locationiq.com/v1/search', GEOCODER_KEY: 'tok' }
			})
		);
		expect(res.status).toBe(200);
		expect(calls[0].url).toContain('https://us1.locationiq.com/v1/search');
		expect(calls[0].url).toContain('key=tok');
	});

	it('returns 404 when nothing matches', async () => {
		const { fn } = fakeFetch(200, []);
		const res = await GET(event({ q: 'nowhere', did: 'did:plc:abc', fetch: fn }));
		expect(res.status).toBe(404);
	});

	it('does not log to console.error on the happy path', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fn } = fakeFetch(200, louisville);
		await GET(event({ q: 'Louisville', did: 'did:plc:abc', fetch: fn }));
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
