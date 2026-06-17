import { describe, it, expect } from 'vitest';
import { assembleSearchPage } from './page';

const hit = (uri: string, distanceMeters?: number) => ({ uri, ...(distanceMeters !== undefined ? { distanceMeters } : {}) });
const rec = (uri: string) => ({ uri, name: `event ${uri}` });

describe('assembleSearchPage', () => {
	it('returns records in Meili rank order regardless of D1 return order, carrying distance', () => {
		const hits = [hit('at://a', 100), hit('at://b', 250), hit('at://c', 900)];
		// D1 hydration returns its own (e.g. startsAt) order.
		const records = [rec('at://c'), rec('at://a'), rec('at://b')];

		const { items, consumed } = assembleSearchPage(hits, records, 20);

		expect(items.map((i) => i.record.uri)).toEqual(['at://a', 'at://b', 'at://c']);
		expect(items.map((i) => i.distanceMeters)).toEqual([100, 250, 900]);
		expect(consumed).toBe(3);
	});

	it('skips hits that failed hydration (contaminated/stale/undiscoverable) and fills from later hits', () => {
		const hits = [hit('at://gone1'), hit('at://a'), hit('at://gone2'), hit('at://b')];
		const records = [rec('at://a'), rec('at://b')];

		const { items, consumed } = assembleSearchPage(hits, records, 20);

		expect(items.map((i) => i.record.uri)).toEqual(['at://a', 'at://b']);
		// All four hits were examined; next page starts after them.
		expect(consumed).toBe(4);
	});

	it('stops once the page is full and consumes only through the last appended hit', () => {
		const hits = [hit('at://a'), hit('at://gone'), hit('at://b'), hit('at://c')];
		const records = [rec('at://a'), rec('at://b'), rec('at://c')];

		const { items, consumed } = assembleSearchPage(hits, records, 2);

		expect(items.map((i) => i.record.uri)).toEqual(['at://a', 'at://b']);
		// at://c (index 3) must be re-served on the next page: consumed stops at index 2 + 1.
		expect(consumed).toBe(3);
	});

	it('returns an empty page with all hits consumed when nothing hydrates', () => {
		const hits = [hit('at://gone1'), hit('at://gone2')];

		const { items, consumed } = assembleSearchPage(hits, [], 20);

		expect(items).toEqual([]);
		expect(consumed).toBe(2);
	});
});
