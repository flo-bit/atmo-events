import { describe, expect, it } from 'vitest';
import { buildEventRecord } from './save';
import { buildLocationEntries } from './location';
import { defaultTheme } from '../theme.js';
import type { EventLocation } from './types';
import type { FlatEventRecord } from '../contrail.js';

// buildEventRecord is the PLAIN editor's write side. (The recurring modal builds
// records independently — see RecurringModal.svelte — sharing only the pure
// buildLocationEntries / eventLocationFromEntries helpers, which are covered in
// location.test.ts, incl. the coords round-trip the recurring path relies on.)
// These tests pin what the mapper unit tests can't see: that the save path routes
// a picked location through buildLocationEntries, that an unchanged edit leaves an
// existing locations[] untouched, and that removing the location drops it.

const BASE = {
	name: 'Test event',
	description: '',
	startsAt: '2026-08-01T18:00',
	endsAt: '',
	timezone: 'America/Chicago',
	mode: 'inperson' as const,
	visibility: 'public' as const,
	theme: defaultTheme,
	links: [] as Array<{ uri: string; name: string }>,
	media: undefined,
	resolveHandle: async () => ''
};

describe('buildEventRecord — location wiring', () => {
	it('routes a new event location through buildLocationEntries (address + geo)', async () => {
		const location: EventLocation = {
			name: 'Humboldt Park',
			locality: 'Chicago',
			region: 'Illinois',
			country: 'US',
			coords: { lat: 41.9027884, lng: -87.7209107 }
		};
		const record = await buildEventRecord({
			...BASE,
			eventData: null,
			isNew: true,
			location,
			locationChanged: true
		});
		// Exactly the builder's output — if save.ts stopped calling it, this breaks.
		expect(record.locations).toEqual(buildLocationEntries(location));
	});

	it('replaces the location on an existing event when it changed', async () => {
		const location: EventLocation = { locality: 'Denver', region: 'Colorado', country: 'US' };
		const eventData = {
			createdAt: '2020-01-01T00:00:00.000Z',
			locations: [{ $type: 'community.lexicon.location.address', locality: 'Chicago' }]
		} as unknown as FlatEventRecord;
		const record = await buildEventRecord({
			...BASE,
			eventData,
			isNew: false,
			location,
			locationChanged: true
		});
		expect(record.locations).toEqual(buildLocationEntries(location));
	});

	it('preserves an existing locations[] wholesale when the location is unchanged', async () => {
		// Includes a geo entry and an unknown/foreign entry: an unrelated edit must
		// not drop, reorder, or rewrite any of them.
		const existing = [
			{ $type: 'community.lexicon.location.address', name: 'Old Venue', locality: 'Chicago' },
			{ $type: 'community.lexicon.location.geo', latitude: '41.9', longitude: '-87.7' },
			{ $type: 'community.example.unknown.v1', foo: 'bar' }
		];
		const eventData = {
			createdAt: '2020-01-01T00:00:00.000Z',
			locations: existing
		} as unknown as FlatEventRecord;
		const record = await buildEventRecord({
			...BASE,
			eventData,
			isNew: false,
			location: null,
			locationChanged: false
		});
		expect(record.locations).toEqual(existing);
	});

	it('drops locations[] when the location is removed on an existing event', async () => {
		// locationChanged + no location => removal must take effect despite the
		// initial `...eventData` spread having copied the old locations[].
		const eventData = {
			createdAt: '2020-01-01T00:00:00.000Z',
			locations: [{ $type: 'community.lexicon.location.address', locality: 'Chicago' }]
		} as unknown as FlatEventRecord;
		const record = await buildEventRecord({
			...BASE,
			eventData,
			isNew: false,
			location: null,
			locationChanged: true
		});
		expect(record.locations).toBeUndefined();
	});
});
