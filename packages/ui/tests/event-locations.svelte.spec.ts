import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
import EventView from '../src/EventView.svelte';
import EventLocationBlock from '../src/event-view/EventLocationBlock.svelte';
import {
	getLocations,
	getLocationSummary,
	resolveGeoLocation
} from '../src/event-view/locations.js';
import type { EventLocationVariant } from '../src/event-types.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

vi.mock('../src/Map.svelte', () => import('./LocationMapFixture.svelte'));

const address = {
	$type: 'community.lexicon.location.address',
	name: 'Main hall',
	street: '1 Main St',
	locality: 'Berlin',
	region: 'Berlin',
	postalCode: '10115',
	country: 'DE'
};
const geo = { $type: 'community.lexicon.location.geo', latitude: '0', longitude: '-0.125' };
const fsq = { $type: 'community.lexicon.location.fsq', fsq_place_id: 'venue-123' };
const h3 = { $type: 'community.lexicon.location.hthree', value: '872681a33ffffff' };
const uri = {
	$type: 'community.lexicon.calendar.event#uri',
	name: 'Join online',
	uri: 'https://example.com/meeting'
};
const allLocations = [address, geo, fsq, h3, uri];
const placeRef = {
	$type: uri.$type,
	name: 'The Domino',
	uri: 'at://did:plc:wwd3t4coccvqtxkjsf6cfsrv/coop.lexicon.place/cywjncv3knjp7doddnlmghbc5'
};

function viewProps(locations: EventLocationVariant[]) {
	return {
		data: {
			eventData: { ...event, locations },
			actorDid: event.did,
			rkey: event.rkey,
			hostProfile: { did: event.did, handle: viewer.handle },
			attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
		},
		adapter: createAdapter(),
		viewer,
		pageUrl: new URL('https://atmo.rsvp/test')
	};
}

afterEach(async () => {
	vi.unstubAllGlobals();
	await page.viewport(1280, 1000);
});

describe('location formatting', () => {
	it('uses the actual lexicon fields for all five variants, including unnamed locations', () => {
		const locations = getLocations(allLocations);
		expect(locations.map((location) => location.kind)).toEqual([
			'address',
			'geo',
			'fsq',
			'hthree',
			'uri'
		]);
		expect(locations[0]).toMatchObject({
			label: 'Main hall',
			detail: '1 Main St, Berlin, Berlin, 10115, DE'
		});
		expect(locations[1]).toMatchObject({
			label: '0.00000, -0.12500',
			coordinates: { lat: 0, lng: -0.125 }
		});
		expect(locations[2]).toMatchObject({
			label: 'Foursquare: venue-123',
			href: 'https://foursquare.com/v/venue-123'
		});
		expect(locations[3]).toMatchObject({ label: 'H3: 872681a33ffffff' });
		expect(locations[4]).toMatchObject({ label: 'Join online', detail: uri.uri, href: uri.uri });
	});

	it('preserves multiple addresses in record order and does not mutate the input', () => {
		const input = [address, { ...address, name: 'Second hall', locality: 'Potsdam' }];
		const original = structuredClone(input);
		const locations = getLocations(input);
		expect(locations.map((location) => location.label)).toEqual(['Main hall', 'Second hall']);
		expect(getLocationSummary(locations)).toBe('Berlin · Potsdam');
		expect(input).toEqual(original);
	});

	it('keeps city summaries compact, but supports every non-address variant on cards', () => {
		expect(getLocationSummary(getLocations([geo, address, fsq, uri]))).toBe('Berlin · Join online');
		expect(getLocationSummary(getLocations([geo, { ...fsq, name: 'The Pub' }]))).toBe('The Pub');
		expect(getLocationSummary(getLocations([geo, uri]))).toBe('Join online');
		for (const variant of [geo, fsq, h3, uri]) {
			expect(getLocationSummary(getLocations([variant]))).toBeTruthy();
		}
		expect(
			getLocationSummary(
				getLocations([{ $type: address.$type, country: 'US', region: 'California' }])
			)
		).toBeUndefined();
	});

	it('ignores malformed and unknown variants rather than guessing their type', () => {
		const malformed = [
			null,
			42,
			{},
			{ $type: 'future.location', name: 'Future', uri: 'https://example.com' },
			{ $type: geo.$type, lat: 10, lng: 20 },
			{ $type: fsq.$type, fid: 'wrong' },
			{ $type: h3.$type, cell: 'wrong' },
			{ $type: uri.$type, uri: ' ' }
		];
		expect(getLocations(malformed as EventLocationVariant[])).toEqual([]);
		expect(getLocations(undefined)).toEqual([]);
	});

	it.each(['', ' ', 'NaN', 'Infinity', '91', '52.5junk', '0x10'])(
		'rejects invalid latitude %j',
		(latitude) => {
			expect(getLocations([{ ...geo, latitude }])).toEqual([]);
		}
	);

	it('rejects out-of-range longitude and accepts coordinate boundaries', () => {
		expect(getLocations([{ ...geo, longitude: '181' }])).toEqual([]);
		expect(getLocations([{ ...geo, latitude: '-90', longitude: '180' }])[0].coordinates).toEqual({
			lat: -90,
			lng: 180
		});
	});

	it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '/relative'])(
		'displays %s as text, never as an active web link',
		(value) => {
			const location = getLocations([{ ...uri, uri: value }])[0];
			expect(location.detail).toBe(value);
			expect(location.href).toBeUndefined();
		}
	);
});

describe('map resolution', () => {
	it('uses explicit coordinates without geocoding, even when the address is first', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(await resolveGeoLocation(getLocations([address, geo]))).toMatchObject({
			lat: 0,
			lng: -0.125
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uses Foursquare coordinates without requiring an address', async () => {
		expect(
			await resolveGeoLocation(getLocations([{ ...fsq, latitude: '40.7', longitude: '-74' }]))
		).toMatchObject({ lat: 40.7, lng: -74 });
	});

	it('prefers geo over Foursquare regardless of record order', async () => {
		expect(
			await resolveGeoLocation(getLocations([{ ...fsq, latitude: '40.7', longitude: '-74' }, geo]))
		).toMatchObject({ lat: 0, lng: -0.125 });
	});

	it('decodes H3 cells to an approximate map position without geocoding', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const resolved = await resolveGeoLocation(getLocations([address, h3]));
		expect(resolved?.lat).toBeCloseTo(40.01, 1);
		expect(resolved?.lng).toBeCloseTo(-105.28, 1);
		expect(resolved?.label).toContain('Approximate area');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('geocodes an address and retains its map label and OSM link', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ lat: 52.5, lng: 13.4, osmType: 'way', osmId: 123 })
		);
		vi.stubGlobal('fetch', fetchMock);
		const resolved = await resolveGeoLocation(getLocations([address]));
		expect(fetchMock).toHaveBeenCalledWith(
			`/api/geocoding?q=${encodeURIComponent('Main hall, 1 Main St, Berlin, Berlin, 10115, DE')}`
		);
		expect(resolved).toMatchObject({
			lat: 52.5,
			lng: 13.4,
			osmUrl: 'https://www.openstreetmap.org/way/123'
		});
	});

	it('never geocodes URIs, unknown locations, or invalid H3 cells', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(
			await resolveGeoLocation(getLocations([uri, { ...h3, value: 'not-a-cell' }]))
		).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([null, { lat: 100, lng: 10 }, { lat: '10', lng: '20' }])(
		'ignores an invalid geocoder response %j',
		async (value) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json(value))
			);
			expect(await resolveGeoLocation(getLocations([address]))).toBeNull();
		}
	);

	it('keeps location text available if geocoding fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		expect(await resolveGeoLocation(getLocations([address]))).toBeNull();
		expect(getLocations([address])[0].label).toBe('Main hall');
	});
});

describe('location UI', () => {
	it('groups physical locations separately from online links without redundant GPS rows', async () => {
		await render(EventLocationBlock, {
			locations: getLocations([
				geo,
				address,
				{ ...fsq, name: 'The Pub' },
				h3,
				uri,
				{ ...address, name: 'Second hall' }
			])
		});
		const list = page.getByRole('list', { name: 'Event locations' });
		await expect.element(list).toBeVisible();
		expect(list.element().querySelectorAll('li')).toHaveLength(2);
		expect(list.element().textContent).not.toContain('0.00000, -0.12500');
		expect(list.element().textContent).not.toContain('H3:');
		await expect
			.element(page.getByText('1 Main St, Berlin, Berlin, 10115, DE', { exact: true }).first())
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: /Join online/ }))
			.toHaveAttribute('href', uri.uri);
		await expect
			.element(page.getByRole('link', { name: 'The Pub', exact: true }))
			.toHaveAttribute('href', 'https://foursquare.com/v/venue-123');
		for (const link of list.element().querySelectorAll('a')) {
			expect(link.target).toBe('_blank');
			expect(link.rel).toContain('noopener');
		}
	});

	it('uses coordinates only as a fallback and hides them when a venue name is available', async () => {
		const { rerender } = await render(EventLocationBlock, { locations: getLocations([geo]) });
		await expect.element(page.getByRole('link', { name: '0.00000, -0.12500' })).toBeVisible();
		await rerender({ locations: getLocations([{ ...geo, name: 'Riverside pub' }]) });
		await expect
			.element(page.getByRole('link', { name: 'Riverside pub', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByText('0.00000, -0.12500', { exact: true }))
			.not.toBeInTheDocument();
	});

	it('deduplicates venue names supplied by multiple location variants', async () => {
		await render(EventLocationBlock, {
			locations: getLocations([address, { ...fsq, name: address.name }])
		});
		const list = page.getByRole('list', { name: 'Event locations' });
		await expect.element(list).toBeVisible();
		await expect.element(page.getByText('Main hall', { exact: true })).toBeVisible();
	});

	it('folds AT place references into the venue and address', async () => {
		await render(
			EventView,
			viewProps([
				placeRef,
				{ ...geo, latitude: '29.9675', longitude: '-90.0450' },
				{
					...address,
					name: 'The Domino',
					street: '3044 St Claude Ave',
					locality: 'New Orleans',
					region: 'LA',
					postalCode: '70117',
					country: 'US'
				}
			])
		);
		const list = page.getByRole('list', { name: 'Event locations' });
		await expect.element(list).toBeVisible();
		expect(list.element().querySelectorAll('li')).toHaveLength(1);
		expect(list.element().textContent).not.toContain('at://');
		expect(list.element().textContent).not.toContain('29.96750');
		const venue = page.getByRole('link', { name: 'The Domino', exact: true });
		await expect
			.element(venue)
			.toHaveAttribute(
				'href',
				`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('The Domino, 3044 St Claude Ave, New Orleans, LA, 70117, US')}`
			);
		await expect
			.element(page.getByText('3044 St Claude Ave, New Orleans, LA, 70117, US', { exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('img', { name: 'Map at 29.9675, -90.045' }))
			.toBeInTheDocument();
	});

	it('uses a standalone AT reference name without exposing its URI or inventing a link', async () => {
		const locations = getLocations([placeRef]);
		expect(getLocationSummary(locations)).toBe('The Domino');
		const { rerender } = await render(EventLocationBlock, { locations });
		await expect.element(page.getByText('The Domino', { exact: true })).toBeVisible();
		const list = page.getByRole('list', { name: 'Event locations' });
		expect(list.element().textContent).not.toContain('at://');
		expect(list.element().querySelectorAll('a')).toHaveLength(0);
		await rerender({ locations: getLocations([{ ...placeRef, name: undefined }]) });
		await expect.element(list).not.toBeInTheDocument();
	});

	it('omits the location block when there are no supported locations', async () => {
		render(EventLocationBlock, { locations: [] });
		await expect
			.element(page.getByRole('list', { name: 'Event locations' }))
			.not.toBeInTheDocument();
	});

	it('renders actual event details and a map for geo-only events, and updates both on navigation', async () => {
		const { rerender } = await render(EventView, viewProps([{ ...geo, name: 'Riverside' }]));
		await expect.element(page.getByRole('list', { name: 'Event locations' })).toBeVisible();
		await expect.element(page.getByRole('img', { name: 'Map at 0, -0.125' })).toBeInTheDocument();
		await rerender(viewProps([{ ...geo, name: 'Hilltop', latitude: '42', longitude: '13' }]));
		await expect.element(page.getByRole('img', { name: 'Map at 42, 13' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: /Hilltop/ })).toBeVisible();
		await expect.element(page.getByRole('link', { name: /Riverside/ })).not.toBeInTheDocument();
		await rerender(viewProps([uri]));
		await expect
			.element(page.getByRole('button', { name: 'Copy coordinates' }))
			.not.toBeInTheDocument();
	});

	it('ignores a stale geocoding result after navigating to another event', async () => {
		let complete!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						complete = resolve;
					})
			)
		);
		const { rerender } = await render(EventView, viewProps([address]));
		await expect.poll(() => typeof complete).toBe('function');
		await rerender(viewProps([geo]));
		await expect.element(page.getByRole('img', { name: 'Map at 0, -0.125' })).toBeInTheDocument();
		complete(Response.json({ lat: 50, lng: 10 }));
		await new Promise((resolve) => setTimeout(resolve, 30));
		await expect.element(page.getByRole('img', { name: 'Map at 0, -0.125' })).toBeInTheDocument();
	});

	it('wraps long URI locations on mobile and passes accessibility checks', async () => {
		await page.viewport(320, 1000);
		render(EventLocationBlock, {
			locations: getLocations([
				...allLocations,
				{ ...uri, name: undefined, uri: `https://example.com/${'long-path'.repeat(40)}` },
				{ ...uri, uri: 'javascript:alert(1)', name: 'Unsafe link' }
			])
		});
		await expect.element(page.getByRole('list', { name: 'Event locations' })).toBeVisible();
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
		await expect.element(page.getByRole('link', { name: /Unsafe link/ })).not.toBeInTheDocument();
		const audit = await axe.run(document.body, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
		});
		expect(audit.violations.map(({ id }) => id)).toEqual([]);
	});
});
