import { describe, expect, it } from 'vitest';
import type { FlatEventRecord } from '@atmo-dev/events-ui';
import { eventMarkers } from './event-markers';

function event(overrides: Partial<FlatEventRecord> = {}): FlatEventRecord {
	return {
		did: 'did:plc:host',
		rkey: 'one',
		uri: 'at://did:plc:host/community.lexicon.calendar.event/one',
		name: 'Meetup',
		createdAt: '2026-10-01T10:00:00Z',
		startsAt: '2026-11-01T18:00:00Z',
		locations: [
			{ $type: 'community.lexicon.location.geo', latitude: '48.21', longitude: '16.37' },
			{ $type: 'community.lexicon.location.address', locality: 'Vienna' }
		],
		...overrides
	};
}

const geo = (latitude: unknown, longitude: unknown) => ({
	$type: 'community.lexicon.location.geo',
	latitude,
	longitude
});

describe('homepage event markers', () => {
	it('uses real event coordinates, city names and canonical event links', () => {
		const [marker] = eventMarkers([event()], { 'did:plc:host': 'host.example' });
		expect(marker).toMatchObject({ label: 'Vienna', lat: 48.21, lon: 16.37 });
		expect(marker.events).toEqual([
			{
				id: event().uri,
				title: 'Meetup',
				startsAt: '2026-11-01T18:00:00Z',
				href: '/p/host.example/e/one'
			}
		]);
	});

	it('shortens imported reverse-geocoded addresses to a venue name', () => {
		const location = {
			...geo('-31.9881747', '115.8708616'),
			name: 'The Como Hotel, 243, Canning Highway, South Perth, Perth, Western Australia, 6151, Australia'
		};
		expect(eventMarkers([event({ locations: [location] })])[0].label).toBe('The Como Hotel');
	});

	it('groups events at the same location without duplicating records', () => {
		const first = event();
		const second = event({
			uri: 'at://did:plc:host/community.lexicon.calendar.event/two',
			rkey: 'two'
		});
		const markers = eventMarkers([first, second, first]);
		expect(markers).toHaveLength(1);
		expect(markers[0].events).toHaveLength(2);
	});

	it('does not invent coordinates for address-only or virtual events', () => {
		expect(
			eventMarkers([
				event({ locations: [{ $type: 'community.lexicon.location.address', locality: 'Vienna' }] }),
				event({ uri: 'virtual', mode: 'community.lexicon.calendar.event#virtual' }),
				event({ uri: 'none', locations: undefined })
			])
		).toEqual([]);
	});

	it('rejects invalid coordinates, including empty values that coerce to zero', () => {
		for (const [lat, lon] of [
			['', '1'],
			[null, '1'],
			[false, 1],
			['NaN', 1],
			[Infinity, 1],
			[91, 1],
			[-91, 1],
			[1, 181],
			[1, -181],
			[1, undefined]
		]) {
			expect(eventMarkers([event({ locations: [geo(lat, lon)] })])).toEqual([]);
		}
	});

	it('accepts numeric coordinates and zero on either axis', () => {
		expect(eventMarkers([event({ locations: [geo(0, '0')] })])[0]).toMatchObject({
			lat: 0,
			lon: 0,
			label: 'Event location'
		});
	});

	it('uses only the first valid geographic venue for each event', () => {
		const markers = eventMarkers([event({ locations: [geo('', ''), geo(45, 10), geo(50, 20)] })]);
		expect(markers).toHaveLength(1);
		expect(markers[0]).toMatchObject({ lat: 45, lon: 10 });
	});

	it('keeps private-event routes and falls back to the host DID', () => {
		const [marker] = eventMarkers([
			event({ space: 'at://did:plc:host/app.bsky.authSpace/secret' })
		]);
		expect(marker.events?.[0].href).toBe('/p/did:plc:host/e/one/s/secret');
	});
});
