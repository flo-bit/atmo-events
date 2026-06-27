import { describe, it, expect } from 'vitest';
import {
	backoffMs,
	isEligible,
	groupEventsByNorm,
	addressNeedingGeocode,
	MAX_FAIL
} from './geocode-cache';
import type { GeocodeCacheRow } from './geocode-cache';
import { ADDRESS_TYPE } from './address-norm';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

function negative(failCount: number, ageMs: number): GeocodeCacheRow {
	return {
		address_norm: 'x',
		lat: null,
		lng: null,
		precision: null,
		source: 'locationiq',
		geocoded_at: NOW - ageMs,
		fail_count: failCount,
		last_error: 'not found'
	};
}

describe('backoffMs', () => {
	it('escalates 1d / 7d / 30d', () => {
		expect(backoffMs(1)).toBe(DAY);
		expect(backoffMs(2)).toBe(7 * DAY);
		expect(backoffMs(3)).toBe(30 * DAY);
	});
});

describe('isEligible', () => {
	it('treats an absent row as work', () => {
		expect(isEligible(undefined, NOW)).toBe(true);
	});

	it('never re-geocodes a resolved row', () => {
		const resolved: GeocodeCacheRow = {
			address_norm: 'x',
			lat: 50,
			lng: 4,
			precision: 'locality',
			source: 'locationiq',
			geocoded_at: NOW - 999 * DAY,
			fail_count: 0,
			last_error: null
		};
		expect(isEligible(resolved, NOW)).toBe(false);
	});

	it('retries a negative row only after its backoff elapses', () => {
		expect(isEligible(negative(1, 0.5 * DAY), NOW)).toBe(false); // < 1d
		expect(isEligible(negative(1, 1.5 * DAY), NOW)).toBe(true); // >= 1d
		expect(isEligible(negative(2, 3 * DAY), NOW)).toBe(false); // < 7d
		expect(isEligible(negative(2, 8 * DAY), NOW)).toBe(true); // >= 7d
	});

	it('hard-stops at fail_count >= MAX_FAIL', () => {
		expect(isEligible(negative(MAX_FAIL, 999 * DAY), NOW)).toBe(false);
	});

	it('--retry-negative ignores backoff and the hard stop', () => {
		expect(isEligible(negative(MAX_FAIL, 0), NOW, true)).toBe(true);
	});
});

describe('addressNeedingGeocode', () => {
	const addr = { $type: ADDRESS_TYPE, locality: 'Dayton', country: 'US' };
	const geo = (lat: string, lng: string) => ({
		$type: 'community.lexicon.location.geo',
		latitude: lat,
		longitude: lng
	});
	const fsq = (lat: string, lng: string) => ({
		$type: 'community.lexicon.location.fsq',
		latitude: lat,
		longitude: lng
	});

	it('returns the address location for an address-only event', () => {
		expect(addressNeedingGeocode({ locations: [addr] })).toMatchObject({
			locality: 'Dayton',
			country: 'US'
		});
	});

	it('returns null when a geo location already resolves to coordinates (no overwrite)', () => {
		expect(addressNeedingGeocode({ locations: [geo('40', '-105'), addr] })).toBeNull();
	});

	it('returns null when an fsq location already resolves to coordinates (F1a)', () => {
		expect(addressNeedingGeocode({ locations: [fsq('50.8', '4.3'), addr] })).toBeNull();
	});

	it('returns the address location when the only coordinate location is out of range (F1b)', () => {
		expect(addressNeedingGeocode({ locations: [geo('999', '0'), addr] })).toMatchObject({
			locality: 'Dayton'
		});
	});

	it('returns null when there is no address location to geocode', () => {
		expect(addressNeedingGeocode({ locations: [geo('40', '-105')] })).toBeNull();
		expect(addressNeedingGeocode({ locations: [] })).toBeNull();
	});
});

describe('groupEventsByNorm', () => {
	it('buckets events by normalized address and skips unkeyable ones', () => {
		const ev = (rkey: string, loc: Record<string, unknown>) => ({
			uri: `at://did:plc:a/community.lexicon.calendar.event/${rkey}`,
			did: 'did:plc:a',
			rkey,
			loc: { $type: ADDRESS_TYPE, ...loc }
		});
		const map = groupEventsByNorm([
			ev('1', { locality: 'Dayton', country: 'US' }),
			ev('2', { locality: 'Dayton', country: 'US' }),
			ev('3', { locality: 'Berlin', country: 'DE' }),
			ev('4', {}) // unkeyable -> skipped
		]);
		expect([...map.keys()].sort()).toEqual(['berlin|de', 'dayton|us']);
		expect(map.get('dayton|us')!.map((e: { rkey: string }) => e.rkey)).toEqual(['1', '2']);
	});
});
