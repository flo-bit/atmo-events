import { describe, it, expect } from 'vitest';
import { racoImporter } from './raco';
import { importContext, stubFetch, jsonReply, blockRealFetch } from './test-support';

// ra.co is a URL-matched importer that POSTs to a GraphQL API — a different
// modality from guild (host-matched GET). This exercises the shared harness
// against a POST endpoint, including asserting the request the importer builds.

const GRAPHQL = 'ra.co/graphql';

/** A representative ra.co GraphQL `event` payload (shape mirrors the live API). */
const raEvent = {
	id: '2065643',
	title: 'Bicep Presents: Chroma',
	content: 'A live audiovisual show.',
	startTime: '2026-06-06T22:00:00.000', // naive venue wall-time
	endTime: '2026-06-07T04:00:00.000',
	flyerFront: 'https://images.ra.co/flyer-front.jpg',
	flyerBack: null,
	venue: {
		name: 'Printworks',
		address: '1 Surrey Quays Road',
		area: { name: 'London', ianaTimeZone: 'Europe/London', country: { name: 'UK' } }
	},
	artists: [{ name: 'Bicep' }, { name: 'Special Guest' }],
	images: [{ filename: 'https://images.ra.co/big.jpg', type: 'FLYERFRONT' }]
};

blockRealFetch();

describe('racoImporter.accept', () => {
	it.each([
		['https://ra.co/events/2065643', true],
		['https://www.ra.co/events/2065643', true],
		['https://ra.co/events/2065643/tickets', true], // still a numeric event path
		['https://ra.co/events/not-a-number', false], // id must be digits
		['https://ra.co/clubs/123', false], // wrong path
		['https://example.com/events/2065643', false], // wrong host
		['nonsense', false]
	])('%s -> %s', (url, expected) => {
		expect(racoImporter.accept(importContext(url))).toBe(expected);
	});
});

describe('racoImporter.parseData', () => {
	it('POSTs the parsed event id to the GraphQL API with the ra-content-language header', async () => {
		const seen: {
			method?: string;
			body?: { operationName?: string; variables?: unknown };
			lang?: string;
		} = {};
		stubFetch([
			{
				when: GRAPHQL,
				reply: (_url, init) => {
					seen.method = init?.method;
					seen.body = init?.body ? JSON.parse(String(init.body)) : undefined;
					seen.lang = (init?.headers as Record<string, string>)?.['ra-content-language'];
					return jsonReply({ data: { event: raEvent } });
				}
			}
		]);

		await racoImporter.parseData(importContext('https://ra.co/events/2065643'));

		expect(seen.method).toBe('POST');
		expect(seen.body?.operationName).toBe('GET_EVENT_DETAIL');
		expect(seen.body?.variables).toEqual({ id: '2065643' });
		expect(seen.lang).toBe('en');
	});

	it('maps title, lineup and venue, and applies the venue-zone offset to naive times', async () => {
		stubFetch([{ when: GRAPHQL, reply: () => jsonReply({ data: { event: raEvent } }) }]);

		const result = await racoImporter.parseData(importContext('https://ra.co/events/2065643'));

		expect(result).toMatchObject({
			source: 'https://ra.co/events/2065643',
			name: 'Bicep Presents: Chroma',
			mode: 'inperson',
			timezone: 'Europe/London',
			location: { street: 'Printworks, 1 Surrey Quays Road', locality: 'London', country: 'UK' },
			imageUrl: 'https://images.ra.co/big.jpg'
		});
		// June in London is BST (+01:00); the naive wall-time gets that offset appended.
		expect(result?.startsAt).toBe('2026-06-06T22:00:00+01:00');
		expect(result?.endsAt).toBe('2026-06-07T04:00:00+01:00');
		expect(result?.description).toContain('Lineup: Bicep, Special Guest');
	});

	it('returns null when the API carries no event (graceful, no throw)', async () => {
		stubFetch([{ when: GRAPHQL, reply: () => jsonReply({ data: { event: null } }) }]);
		const result = await racoImporter.parseData(importContext('https://ra.co/events/2065643'));
		expect(result).toBeNull();
	});

	it('throws on a non-OK GraphQL response so /api/import-event surfaces a 502', async () => {
		stubFetch([{ when: GRAPHQL, reply: () => jsonReply({}, 500) }]);
		await expect(
			racoImporter.parseData(importContext('https://ra.co/events/2065643'))
		).rejects.toThrow(/ra\.co graphql 500/);
	});
});
