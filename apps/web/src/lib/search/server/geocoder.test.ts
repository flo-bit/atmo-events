// apps/web/src/lib/search/server/geocoder.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
	addressToQuery,
	derivePrecision,
	createGeocoder,
	requireGeocoderForBulk
} from './geocoder';

describe('addressToQuery', () => {
	it('joins present fields in fixed order with commas, preserving original case', () => {
		expect(
			addressToQuery({
				country: 'België / Belgique / Belgien',
				street: 'Cantersteen 41',
				locality: 'Bruxelles - Brussel',
				region: 'Brussel-Hoofdstad'
			})
		).toBe('Cantersteen 41, Bruxelles - Brussel, Brussel-Hoofdstad, België / Belgique / Belgien');
	});

	it('skips absent/blank fields', () => {
		expect(addressToQuery({ locality: 'Dayton', region: '   ', country: 'US' })).toBe('Dayton, US');
	});
});

describe('derivePrecision', () => {
	it('classifies a house/building hit as rooftop', () => {
		expect(derivePrecision({ addresstype: 'house', place_rank: 30 })).toBe('rooftop');
	});
	it('classifies a road hit as street', () => {
		expect(derivePrecision({ type: 'road', class: 'highway' })).toBe('street');
	});
	it('classifies a city/region hit as locality', () => {
		expect(derivePrecision({ addresstype: 'city' })).toBe('locality');
		expect(derivePrecision({ type: 'administrative', class: 'boundary' })).toBe('locality');
	});
	it('falls back to the raw type when unclassifiable', () => {
		expect(derivePrecision({ type: 'attraction' })).toBe('attraction');
		expect(derivePrecision({})).toBe('unknown');
	});
});

describe('createGeocoder', () => {
	function fakeFetch(body: unknown, status = 200) {
		const calls: { url: string; headers: Record<string, string> }[] = [];
		const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
			return new Response(JSON.stringify(body), { status });
		});
		return { fn: fn as unknown as typeof fetch, calls };
	}

	it('defaults to public Nominatim with the atmo user-agent', async () => {
		const { fn, calls } = fakeFetch([{ lat: '50.84', lon: '4.36', addresstype: 'city' }]);
		const geo = createGeocoder({}, fn);
		const point = await geo.geocode('Bruxelles, BE');
		expect(point).toEqual({ lat: 50.84, lng: 4.36, precision: 'locality' });
		expect(calls[0].url).toContain('https://nominatim.openstreetmap.org/search');
		expect(calls[0].url).toContain('q=Bruxelles%2C+BE');
		expect(calls[0].headers['user-agent']).toContain('atmo-events');
	});

	it('switches to a keyed LocationIQ endpoint when GEOCODER_KEY+URL are set', async () => {
		const { fn, calls } = fakeFetch([{ lat: '52.5', lon: '13.4', addresstype: 'road' }]);
		const geo = createGeocoder(
			{ GEOCODER_URL: 'https://us1.locationiq.com/v1/search', GEOCODER_KEY: 'tok' },
			fn
		);
		await geo.geocode('Berlin');
		expect(calls[0].url).toContain('https://us1.locationiq.com/v1/search');
		expect(calls[0].url).toContain('key=tok');
	});

	it('returns null on an empty result set (no-match)', async () => {
		const { fn } = fakeFetch([]);
		expect(await createGeocoder({}, fn).geocode('nowhere')).toBeNull();
	});

	it('returns null on a 404 (LocationIQ no-match) so it negative-caches, not retries', async () => {
		const { fn } = fakeFetch({ error: 'Unable to geocode' }, 404);
		expect(await createGeocoder({}, fn).geocode('nowhere')).toBeNull();
	});

	it('throws on a transient HTTP error (429/5xx) so the caller retries', async () => {
		const { fn } = fakeFetch({}, 429);
		await expect(createGeocoder({}, fn).geocode('x')).rejects.toThrow(/429/);
	});
});

describe('requireGeocoderForBulk', () => {
	it('allows any run when a geocoder key is set', () => {
		expect(() =>
			requireGeocoderForBulk({ hasKey: true, dryRun: false, limit: 0, allowPublic: false })
		).not.toThrow();
		expect(() =>
			requireGeocoderForBulk({ hasKey: true, dryRun: false, limit: 5000, allowPublic: false })
		).not.toThrow();
	});

	it('allows a keyless small drip (1..25)', () => {
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: false, limit: 25, allowPublic: false })
		).not.toThrow();
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: false, limit: 1, allowPublic: false })
		).not.toThrow();
	});

	it('blocks a keyless run over the drip ceiling', () => {
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: false, limit: 26, allowPublic: false })
		).toThrow(/LocationIQ|allow-public-nominatim/);
	});

	it('blocks a keyless uncapped run (limit 0 = no cap, the worst case)', () => {
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: false, limit: 0, allowPublic: false })
		).toThrow(/LocationIQ|allow-public-nominatim/);
	});

	it('blocks a keyless negative limit (uncapped, not a tiny drip)', () => {
		// A stray `--limit -1` must not masquerade as a 1-call drip and slip the gate.
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: false, limit: -1, allowPublic: false })
		).toThrow(/LocationIQ|allow-public-nominatim/);
	});

	it('lets --allow-public-nominatim override a bulk keyless run', () => {
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: false, limit: 0, allowPublic: true })
		).not.toThrow();
	});

	it('never blocks a dry run (it makes no geocoder calls)', () => {
		expect(() =>
			requireGeocoderForBulk({ hasKey: false, dryRun: true, limit: 0, allowPublic: false })
		).not.toThrow();
	});
});
