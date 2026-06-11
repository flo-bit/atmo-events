import { describe, it, expect, vi } from 'vitest';
import { searchEvents, nearMeEvents } from './meili';

// Fake fetch capturing the request and returning a canned Meilisearch response.
function fakeFetch(body: unknown, status = 200) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	}) as unknown as typeof fetch;
	return { fetchFn, calls };
}

const cfg = (fetchFn: typeof fetch) => ({
	url: 'https://search.testnet.openmeet.net',
	apiKey: 'read-only-key',
	fetch: fetchFn
});

describe('searchEvents', () => {
	it('POSTs the query to the events index with bearer auth and returns ranked uris', async () => {
		const { fetchFn, calls } = fakeFetch({
			hits: [
				{ id: 'a', uri: 'at://did:plc:one/community.lexicon.calendar.event/1' },
				{ id: 'b', uri: 'at://did:plc:two/community.lexicon.calendar.event/2' }
			],
			estimatedTotalHits: 7
		});

		const result = await searchEvents(cfg(fetchFn), {
			q: 'kite festival',
			limit: 20,
			offset: 0,
			now: '2026-06-11T00:00:00.000Z'
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://search.testnet.openmeet.net/indexes/events/search');
		expect(calls[0].init.method).toBe('POST');
		expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
			'Bearer read-only-key'
		);
		expect(JSON.parse(String(calls[0].init.body))).toEqual({
			q: 'kite festival',
			limit: 20,
			offset: 0,
			filter:
				'(endsAt >= "2026-06-11T00:00:00.000Z" OR ' +
				'(endsAt NOT EXISTS AND startsAt >= "2026-06-11T00:00:00.000Z"))',
			attributesToRetrieve: ['uri']
		});
		expect(result.hits.map((h) => h.uri)).toEqual([
			'at://did:plc:one/community.lexicon.calendar.event/1',
			'at://did:plc:two/community.lexicon.calendar.event/2'
		]);
		expect(result.estimatedTotalHits).toBe(7);
	});

	it('restricts results to upcoming events: endsAt (or startsAt when no endsAt) >= now', async () => {
		const { fetchFn, calls } = fakeFetch({ hits: [], estimatedTotalHits: 0 });

		await searchEvents(cfg(fetchFn), {
			q: 'kite',
			limit: 20,
			offset: 0,
			now: '2026-06-11T00:00:00.000Z'
		});

		const body = JSON.parse(String(calls[0].init.body));
		expect(body.filter).toBe(
			'(endsAt >= "2026-06-11T00:00:00.000Z" OR ' +
				'(endsAt NOT EXISTS AND startsAt >= "2026-06-11T00:00:00.000Z"))'
		);
		// The upcoming bound is a filter, not a retrieved attribute, so search
		// still asks only for uris.
		expect(body.attributesToRetrieve).toEqual(['uri']);
	});

	it('throws on a non-OK response without leaking the api key', async () => {
		const { fetchFn } = fakeFetch({ message: 'invalid key' }, 403);

		await expect(searchEvents(cfg(fetchFn), { q: 'x', limit: 1, offset: 0 })).rejects.toThrow(
			/search request failed: 403/i
		);
		await expect(
			searchEvents(cfg(fetchFn), { q: 'x', limit: 1, offset: 0 })
		).rejects.not.toThrow(/read-only-key/);
	});
});

describe('nearMeEvents', () => {
	it('filters by _geoRadius, sorts by _geoPoint distance, and surfaces _geoDistance', async () => {
		const { fetchFn, calls } = fakeFetch({
			hits: [
				{
					id: 'a',
					uri: 'at://did:plc:one/community.lexicon.calendar.event/1',
					_geoDistance: 1200
				}
			],
			estimatedTotalHits: 1
		});

		const result = await nearMeEvents(cfg(fetchFn), {
			lat: 38.25,
			lng: -85.76,
			radiusMeters: 25000,
			limit: 20,
			offset: 0,
			now: '2026-06-11T00:00:00.000Z'
		});

		const body = JSON.parse(String(calls[0].init.body));
		expect(body.filter).toBe(
			'_geoRadius(38.25, -85.76, 25000) AND ' +
				'(endsAt >= "2026-06-11T00:00:00.000Z" OR ' +
				'(endsAt NOT EXISTS AND startsAt >= "2026-06-11T00:00:00.000Z"))'
		);
		expect(body.sort).toEqual(['_geoPoint(38.25, -85.76):asc']);
		expect(body.q).toBe('');
		// Meilisearch silently drops _geoDistance from hits when
		// attributesToRetrieve is restricted (verified live, v1.x) — geo
		// queries must request full documents to get distances back.
		expect(body.attributesToRetrieve).toBeUndefined();
		expect(result.hits).toEqual([
			{ uri: 'at://did:plc:one/community.lexicon.calendar.event/1', distanceMeters: 1200 }
		]);
	});

	it('restricts results to upcoming events: endsAt (or startsAt when no endsAt) >= now', async () => {
		const { fetchFn, calls } = fakeFetch({ hits: [], estimatedTotalHits: 0 });

		await nearMeEvents(cfg(fetchFn), {
			lat: 38.25,
			lng: -85.76,
			radiusMeters: 25000,
			limit: 20,
			offset: 0,
			now: '2026-06-11T00:00:00.000Z'
		});

		// An event counts as upcoming while it is still running, so the bound is
		// on endsAt; events with no endsAt fall back to startsAt. Verified live
		// against Meilisearch v1.46.1 — string range compares ISO-8601 UTC
		// chronologically, and EXISTS/NOT EXISTS gate the fallback.
		const body = JSON.parse(String(calls[0].init.body));
		expect(body.filter).toBe(
			'_geoRadius(38.25, -85.76, 25000) AND ' +
				'(endsAt >= "2026-06-11T00:00:00.000Z" OR ' +
				'(endsAt NOT EXISTS AND startsAt >= "2026-06-11T00:00:00.000Z"))'
		);
	});

	it('rejects non-finite coordinates before making any request', async () => {
		const { fetchFn, calls } = fakeFetch({ hits: [], estimatedTotalHits: 0 });

		await expect(
			nearMeEvents(cfg(fetchFn), {
				lat: Number.NaN,
				lng: -85.76,
				radiusMeters: 25000,
				limit: 20,
				offset: 0
			})
		).rejects.toThrow(/invalid coordinates/i);
		expect(calls).toHaveLength(0);
	});
});
