// apps/web/src/lib/search/server/address-norm.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeAddress, addressLocation, ADDRESS_TYPE } from './address-norm';
import { addressNeedingGeocode } from './geocode-cache';

describe('normalizeAddress', () => {
	it('joins all present fields in fixed order with | separators', () => {
		const key = normalizeAddress({
			country: 'US',
			locality: 'Dayton',
			street: '905 East 3rd Street',
			region: 'Ohio',
			postalCode: '45402',
			name: 'The Venue'
		});
		// fixed order: name, street, locality, region, postalCode, country
		expect(key).toBe('the venue|905 east 3rd street|dayton|ohio|45402|us');
	});

	it('omits absent/empty fields entirely', () => {
		expect(normalizeAddress({ locality: 'Dayton', country: 'US' })).toBe('dayton|us');
	});

	it('lowercases, NFC-normalizes, collapses whitespace, trims edge punctuation', () => {
		expect(normalizeAddress({ locality: 'Dayton,', region: '  Ohio   State ' })).toBe(
			'dayton|ohio state'
		);
	});

	it('strips the separator char from field content', () => {
		expect(normalizeAddress({ name: 'A|B', country: 'US' })).toBe('a b|us');
	});

	it('returns null when nothing is present', () => {
		expect(normalizeAddress({})).toBeNull();
		expect(normalizeAddress({ country: '   ' })).toBeNull();
	});

	it('produces an identical key regardless of field insertion order', () => {
		const a = normalizeAddress({ country: 'US', locality: 'Dayton' });
		const b = normalizeAddress({ locality: 'Dayton', country: 'US' });
		expect(a).toBe(b);
	});
});

describe('addressLocation', () => {
	it('returns the first .address location', () => {
		const loc = addressLocation({
			locations: [
				{ $type: 'community.lexicon.location.geo', latitude: '1', longitude: '2' },
				{ $type: ADDRESS_TYPE, locality: 'Dayton', country: 'US' }
			]
		});
		expect(loc).toMatchObject({ locality: 'Dayton', country: 'US' });
	});

	it('returns null when no address location is present', () => {
		expect(
			addressLocation({ locations: [{ $type: 'community.lexicon.location.geo' }] })
		).toBeNull();
		expect(addressLocation({})).toBeNull();
	});
});

// INV-A: the geocode job (write path) keys geocode_cache by
// normalizeAddress(addressNeedingGeocode(record)); the sink (read path) looks it
// back up by normalizeAddress(addressLocation(record)). If those two keys ever
// diverge, the _geo the job writes is invisible to the sink and near-me silently
// loses coordinates. These lock the round-trip - including across the Unicode/
// punctuation/whitespace representation drift a PDS re-serialization can introduce.
describe('INV-A job <-> sink cache-key parity', () => {
	const jobKey = (record: Record<string, unknown>) => {
		const loc = addressNeedingGeocode(record);
		return loc ? normalizeAddress(loc) : null;
	};
	const sinkKey = (record: Record<string, unknown>) => {
		const loc = addressLocation(record);
		return loc ? normalizeAddress(loc) : null;
	};

	it('derives the same non-null key on both paths for one address-only record', () => {
		const record = {
			locations: [{ $type: ADDRESS_TYPE, name: 'The Venue', locality: 'Dayton', country: 'US' }]
		};
		const k = jobKey(record);
		expect(k).not.toBeNull();
		expect(sinkKey(record)).toBe(k);
	});

	it('matches across NFD/NFC, case, whitespace and edge-punctuation drift', () => {
		// Precomposed (NFC) base strings as the source file stores them.
		const venueNFC = 'Café Bar';
		const cityNFC = 'Zürich';
		// Decompose to NFD at runtime so the job side genuinely carries combining
		// marks - independent of how this file happens to be encoded - then add the
		// messy edges (doubled spaces, trailing comma) the job might first see.
		const jobName = `  ${venueNFC.normalize('NFD')}  `;
		const jobCity = `${cityNFC.normalize('NFD')},`;
		const jobRecord = {
			locations: [{ $type: ADDRESS_TYPE, name: jobName, locality: jobCity, country: 'CH' }]
		};
		// The same venue re-serialized: precomposed (NFC), already trimmed/cased.
		const sinkRecord = {
			locations: [{ $type: ADDRESS_TYPE, name: venueNFC, locality: cityNFC, country: 'ch' }]
		};
		// The raw job/sink inputs differ in codepoints (NFD carries combining marks
		// NFC lacks); only NFC folding makes them equal, so this fails if the
		// normalize step ever drops it.
		expect(jobName).not.toBe(venueNFC);
		const expected = `${venueNFC.normalize('NFC').toLowerCase()}|${cityNFC.normalize('NFC').toLowerCase()}|ch`;
		const k = jobKey(jobRecord);
		expect(k).toBe(expected);
		expect(sinkKey(sinkRecord)).toBe(k);
	});
});
