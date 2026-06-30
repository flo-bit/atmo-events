import { describe, it, expect, vi } from 'vitest';
import { runGeocodeJob } from './geocode-job';
import type { D1Client } from './d1-http';
import type { GeoPoint } from './geocoder';
import type { GeocodeCacheRow } from './geocode-cache';
import { ADDRESS_TYPE, normalizeAddress, addressLocation } from './address-norm';
import type { MeiliEventIndex } from './meili-sink';

const NOW = 1_700_000_000_000;

type RawEvent = { uri: string; did: string; rkey: string; record: string };

const addrRecord = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		name: 'Test Event',
		startsAt: '2026-07-01T18:00:00Z',
		locations: [
			{ $type: ADDRESS_TYPE, locality: 'Louisville', region: 'KY', country: 'US', ...over }
		]
	});

/** The normalized cache key the job will compute for a given record — so a
 *  seeded cache row lines up with the worklist's grouping. */
const normFor = (record: string) =>
	normalizeAddress(addressLocation(JSON.parse(record)) as Record<string, unknown>);

/** Minimal D1Client that routes by SQL fragment and captures geocode_cache
 *  writes. `live` (the fresh re-read for fetchLiveDocs) defaults to the worklist
 *  but can differ — to model an event deleted mid-run, or one that gained coords. */
function fakeD1(opts: { cache?: GeocodeCacheRow[]; worklist: RawEvent[]; live?: RawEvent[] }) {
	const live = opts.live ?? opts.worklist;
	const inserts: { sql: string; params: unknown[] }[] = [];
	const client: D1Client = {
		async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
			if (sql.includes('INSERT INTO geocode_cache')) {
				inserts.push({ sql, params });
				return [] as T[];
			}
			if (sql.includes('CREATE TABLE')) return [] as T[];
			if (sql.includes('SELECT * FROM geocode_cache')) return (opts.cache ?? []) as T[];
			if (sql.includes('WHERE uri IN')) {
				// fetchLiveDocs: only rows whose uri is in the bound params
				return live.filter((e) => params.includes(e.uri)) as T[];
			}
			if (sql.includes('json_each')) return opts.worklist as T[]; // WORKLIST_SQL
			return [] as T[];
		}
	};
	return { client, inserts };
}

const geocoderReturning = (point: GeoPoint | null) => ({ geocode: vi.fn(async () => point) });

function fakeMeili() {
	const upsert = vi.fn(async () => {});
	const applySettings = vi.fn(async () => {});
	return {
		meili: { upsert, applySettings } as unknown as MeiliEventIndex,
		upsert,
		applySettings
	};
}

const resolved = (norm: string): GeocodeCacheRow => ({
	address_norm: norm,
	lat: 1,
	lng: 2,
	precision: 'locality',
	source: 'locationiq',
	geocoded_at: NOW - 1000,
	fail_count: 0,
	last_error: null
});

describe('runGeocodeJob', () => {
	it('geocodes a new address: writes cache and _geo-upserts the doc', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client, inserts } = fakeD1({ worklist });
		const { meili, upsert } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76, precision: 'locality' });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(geocoder.geocode).toHaveBeenCalledTimes(1);
		expect(res.resolved).toBe(1);
		// Resolved insert carries lat/lng at params [1],[2].
		const ins = inserts.find((i) => i.params[1] === 38.25);
		expect(ins).toBeTruthy();
		expect(upsert).toHaveBeenCalledTimes(1);
		const docs = (
			upsert.mock.calls[0] as unknown as [Array<{ _geo?: { lat: number; lng: number } }>]
		)[0];
		expect(docs[0]._geo).toEqual({ lat: 38.25, lng: -85.76 });
	});

	it('is idempotent: skips an already-resolved address (no geocoder call)', async () => {
		const record = addrRecord();
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record }];
		const { client, inserts } = fakeD1({ worklist, cache: [resolved(normFor(record)!)] });
		const { meili, upsert } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 1, lng: 2 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(geocoder.geocode).not.toHaveBeenCalled();
		expect(res.processed).toBe(0);
		expect(inserts).toHaveLength(0);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('respects the limit cap across unique addresses', async () => {
		const worklist = [
			{
				uri: 'at://did:x/c/1',
				did: 'did:x',
				rkey: '1',
				record: addrRecord({ locality: 'Berlin' })
			},
			{
				uri: 'at://did:x/c/2',
				did: 'did:x',
				rkey: '2',
				record: addrRecord({ locality: 'Brussels' })
			},
			{ uri: 'at://did:x/c/3', did: 'did:x', rkey: '3', record: addrRecord({ locality: 'Paris' }) }
		];
		const { client } = fakeD1({ worklist });
		const { meili } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 1, lng: 2 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			limit: 2,
			sleepMs: 0,
			now: NOW
		});

		expect(res.uniqueAddresses).toBe(3);
		expect(res.processed).toBe(2);
		expect(geocoder.geocode).toHaveBeenCalledTimes(2);
	});

	it('dry-run computes the worklist but makes no geocoder/cache/Meili writes', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client, inserts } = fakeD1({ worklist });
		const { meili, upsert } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 1, lng: 2 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			dryRun: true,
			sleepMs: 0,
			now: NOW
		});

		expect(res.processed).toBe(1);
		expect(res.resolved).toBe(0);
		expect(geocoder.geocode).not.toHaveBeenCalled();
		expect(inserts).toHaveLength(0);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('writes a negative cache row on no-match (and does not upsert)', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client, inserts } = fakeD1({ worklist });
		const { meili, upsert } = fakeMeili();
		const geocoder = geocoderReturning(null);

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(res.negative).toBe(1);
		expect(res.resolved).toBe(0);
		expect(inserts.some((i) => /no match/.test(i.sql))).toBe(true);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('counts a thrown geocoder error as transient and writes no cache row', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client, inserts } = fakeD1({ worklist });
		const { meili } = fakeMeili();
		const geocoder = {
			geocode: vi.fn(async () => {
				throw new Error('429 rate limited');
			})
		};

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(res.transient).toBe(1);
		expect(res.resolved).toBe(0);
		expect(res.negative).toBe(0);
		expect(inserts).toHaveLength(0);
	});

	it('does NOT positive-cache when the Meili upsert fails (address retries, not skips forever)', async () => {
		// Geocode succeeds and a live doc exists, but the upsert throws. The positive
		// cache row must NOT be written — otherwise the address is cached "resolved"
		// yet never indexed, and the idempotent skip locks in a permanent _geo gap.
		// It must count transient and stay eligible for the next run.
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client, inserts } = fakeD1({ worklist });
		const upsert = vi.fn(async () => {
			throw new Error('Meilisearch PUT failed: 503');
		});
		const applySettings = vi.fn(async () => {});
		const meili = { upsert, applySettings } as unknown as MeiliEventIndex;
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(res.transient).toBe(1);
		expect(res.resolved).toBe(0);
		expect(inserts).toHaveLength(0); // no positive (or any) geocode_cache write
	});

	it('does NOT positive-cache when applySettings fails before the first upsert', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client, inserts } = fakeD1({ worklist });
		const upsert = vi.fn(async () => {});
		const applySettings = vi.fn(async () => {
			throw new Error('Meilisearch PATCH failed: 500');
		});
		const meili = { upsert, applySettings } as unknown as MeiliEventIndex;
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(res.transient).toBe(1);
		expect(res.resolved).toBe(0);
		expect(upsert).not.toHaveBeenCalled();
		expect(inserts).toHaveLength(0);
	});

	it('applies index settings exactly once, before the first upsert (S3)', async () => {
		const worklist = [
			{
				uri: 'at://did:x/c/1',
				did: 'did:x',
				rkey: '1',
				record: addrRecord({ locality: 'Berlin' })
			},
			{ uri: 'at://did:x/c/2', did: 'did:x', rkey: '2', record: addrRecord({ locality: 'Paris' }) }
		];
		const { client } = fakeD1({ worklist });
		const { meili, upsert, applySettings } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76 });

		await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		// Two distinct addresses → two upserts, but settings applied just once...
		expect(applySettings).toHaveBeenCalledTimes(1);
		expect(upsert).toHaveBeenCalledTimes(2);
		// ...and that one application precedes the first upsert (a bare index 400s).
		expect(applySettings.mock.invocationCallOrder[0]).toBeLessThan(
			upsert.mock.invocationCallOrder[0]
		);
	});

	it('never touches Meili when nothing resolves (a no-match run skips settings + upsert)', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		const { client } = fakeD1({ worklist });
		const { meili, upsert, applySettings } = fakeMeili();
		const geocoder = geocoderReturning(null);

		await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(applySettings).not.toHaveBeenCalled();
		expect(upsert).not.toHaveBeenCalled();
	});

	it('caches the address but skips the upsert when the event vanished mid-run (gap 1)', async () => {
		const worklist = [{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record: addrRecord() }];
		// In the worklist, but gone (deleted/unlisted) by the fresh re-read.
		const { client, inserts } = fakeD1({ worklist, live: [] });
		const { meili, upsert, applySettings } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(res.resolved).toBe(1); // the ADDRESS resolved + cached (won't re-geocode)
		expect(res.skippedGone).toBe(1); // but its one event is gone
		expect(upsert).not.toHaveBeenCalled();
		expect(applySettings).not.toHaveBeenCalled();
		expect(inserts.some((i) => i.params[1] === 38.25)).toBe(true);
	});

	it('geocodes a shared address once and upserts every event carrying it (gap 2)', async () => {
		const record = addrRecord(); // identical address on two distinct events
		const worklist = [
			{ uri: 'at://did:x/c/1', did: 'did:x', rkey: '1', record },
			{ uri: 'at://did:y/c/2', did: 'did:y', rkey: '2', record }
		];
		const { client } = fakeD1({ worklist });
		const { meili, upsert } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76 });

		const res = await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		expect(geocoder.geocode).toHaveBeenCalledTimes(1); // one address → one geocoder call
		expect(res.uniqueAddresses).toBe(1);
		expect(res.resolved).toBe(1);
		expect(upsert).toHaveBeenCalledTimes(1);
		const docs = (
			upsert.mock.calls[0] as unknown as [Array<{ _geo?: { lat: number; lng: number } }>]
		)[0];
		expect(docs).toHaveLength(2); // both events upserted in one batch
		expect(docs.every((d) => d._geo?.lat === 38.25)).toBe(true);
	});

	it('does not overwrite a coordinate _geo the record gained mid-run (gap 3)', async () => {
		// Worklist sees an address-only record (eligible to geocode), but the fresh
		// re-read finds it now also carries an in-range geo location.
		const uri = 'at://did:x/c/1';
		const liveRecord = JSON.stringify({
			name: 'Test Event',
			startsAt: '2026-07-01T18:00:00Z',
			locations: [
				{ $type: ADDRESS_TYPE, locality: 'Louisville', region: 'KY', country: 'US' },
				{ $type: 'community.lexicon.location.geo', latitude: '40.0', longitude: '-80.0' }
			]
		});
		const { client } = fakeD1({
			worklist: [{ uri, did: 'did:x', rkey: '1', record: addrRecord() }],
			live: [{ uri, did: 'did:x', rkey: '1', record: liveRecord }]
		});
		const { meili, upsert } = fakeMeili();
		const geocoder = geocoderReturning({ lat: 38.25, lng: -85.76 });

		await runGeocodeJob({
			d1: client,
			geocoder,
			meili,
			source: 'locationiq',
			sleepMs: 0,
			now: NOW
		});

		const docs = (
			upsert.mock.calls[0] as unknown as [Array<{ _geo?: { lat: number; lng: number } }>]
		)[0];
		// The record's own precise coords win — the geocoder point must not clobber them.
		expect(docs[0]._geo).toEqual({ lat: 40, lng: -80 });
	});
});
