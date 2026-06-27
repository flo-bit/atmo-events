// Deterministic cache key for a community.lexicon.location.address, shared
// byte-for-byte by the search sink (read path) and the external geocode job
// (write path). If these two ever diverge the cache keys stop matching and the
// _geo the job writes is invisible to the sink, so this module is the single
// source of truth for both.

export const ADDRESS_TYPE = 'community.lexicon.location.address';

const SEP = '|';
// Fixed field order, independent of the order fields appear in the record, so
// identical data always yields the same key. `name` MUST be included: ~750
// events carry only a venue name + country, and dropping it would collapse
// every venue-only event in a country into one row and cross-contaminate coords.
const FIELDS = ['name', 'street', 'locality', 'region', 'postalCode', 'country'];

export function normalizeAddress(loc: Record<string, unknown>): string | null {
	const key = FIELDS.map((f) => (typeof loc[f] === 'string' ? (loc[f] as string) : ''))
		.map((v) =>
			v
				.normalize('NFC')
				.toLowerCase()
				.replace(/\s+/g, ' ')
				.replace(/\|/g, ' ')
				.replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, '')
				.trim()
		)
		.filter((v) => v !== '')
		.join(SEP);
	return key === '' ? null : key;
}

/** First community.lexicon.location.address in a record's locations[], or null. */
export function addressLocation(record: Record<string, unknown>): Record<string, unknown> | null {
	const locs = Array.isArray(record?.locations) ? record.locations : [];
	for (const l of locs) {
		if (l && typeof l === 'object' && (l as Record<string, unknown>).$type === ADDRESS_TYPE) {
			return l as Record<string, unknown>;
		}
	}
	return null;
}
