import { describe, it, expect } from 'vitest';
import { guildImporter } from './guild';
import {
	importContext,
	stubFetch,
	jsonReply,
	imageReply,
	blockRealFetch,
	type FetchRoute
} from './test-support';

// Real API responses captured from https://guild.host/api/next/events/<slug>.
import svelteChicago from './__fixtures__/guild-svelte-chicago.json';
import reactSummit from './__fixtures__/guild-react-summit.json';
import londonGraphql from './__fixtures__/guild-london-graphql.json';

const API = '/api/next/events/';

/** Route table for one Guild event: the JSON API plus whatever cover image it points at. */
function guildRoutes(event: unknown): FetchRoute[] {
	return [
		{ when: API, reply: () => jsonReply(event) },
		{
			when: /card\.svg(\?|$)/,
			reply: () => imageReply('image/svg+xml', new Uint8Array([0x3c, 0x73, 0x76, 0x67]))
		},
		{ when: '/i/', reply: () => imageReply('image/png') } // uploadedSocialCard lives at guild.host/i/<id>/<fmt>
	];
}

blockRealFetch();

describe('guildImporter.accept', () => {
	it.each([
		['https://guild.host/events/svelte-chicago-march-nbdhmo', true],
		['https://www.guild.host/events/react-summit-amsterdam-0kzjnm', true],
		['https://guild.host/events/foo/tickets', true], // still an event path
		['https://guild.host/', false], // no event
		['https://guild.host/some-community', false], // community page, not an event
		['https://guild.host/events', false], // listing, no slug
		['https://example.com/events/x', false], // wrong host
		['https://notguild.host/events/x', false], // host must match exactly
		['not a url', false]
	])('%s -> %s', (url, expected) => {
		expect(guildImporter.accept(importContext(url))).toBe(expected);
	});
});

describe('guildImporter.parseData maps real captured events', () => {
	it('maps an in-person event with an uploaded social card (Svelte Chicago)', async () => {
		stubFetch(guildRoutes(svelteChicago));
		const url = 'https://guild.host/events/svelte-chicago-march-nbdhmo';

		const result = await guildImporter.parseData(importContext(url));

		expect(result).toMatchObject({
			source: 'https://guild.host/events/svelte-chicago-march-nbdhmo',
			name: 'Svelte Chicago - March 2026',
			timezone: 'America/Chicago',
			startsAt: '2026-03-24T22:30:00+00:00',
			endsAt: '2026-03-25T01:00:00+00:00',
			mode: 'inperson', // hasVenue: true, hasExternalUrl: false
			links: [{ uri: 'https://guild.host/events/svelte-chicago-march-nbdhmo', name: 'Event page' }]
		});
		expect(result?.description).toContain('Svelte Chicago');
		// Cover image was fetched from the uploaded card and inlined as a data URL.
		expect(result?.imageDataUrl).toMatch(/^data:image\//);
	});

	it('maps a multi-day event (React Summit Amsterdam)', async () => {
		stubFetch(guildRoutes(reactSummit));
		const url = 'https://guild.host/events/react-summit-amsterdam-0kzjnm';

		const result = await guildImporter.parseData(importContext(url));

		expect(result).toMatchObject({
			name: 'React Summit Amsterdam 2025',
			timezone: 'Europe/Warsaw',
			startsAt: '2025-06-13T06:00:00+00:00',
			endsAt: '2025-06-17T19:00:00+00:00',
			mode: 'inperson'
		});
		expect(result?.imageDataUrl).toMatch(/^data:image\//);
	});
});

describe('guildImporter robustness', () => {
	it('imports an event whose description is absent (optional field degrades)', async () => {
		const { description, ...noDescription } = svelteChicago as Record<string, unknown>;
		void description;
		stubFetch(guildRoutes(noDescription));
		const result = await guildImporter.parseData(
			importContext('https://guild.host/events/svelte-chicago-march-nbdhmo')
		);
		expect(result?.name).toBe('Svelte Chicago - March 2026');
		expect(result?.description).toBeUndefined();
	});

	it('throws on a non-OK Guild API response so /api/import-event surfaces a 502', async () => {
		stubFetch([{ when: API, reply: () => jsonReply({ error: 'nope' }, 503) }]);
		await expect(
			guildImporter.parseData(importContext('https://guild.host/events/whatever'))
		).rejects.toThrow(/failed to fetch guild event/);
	});

	// The Guild API returns `uploadedSocialCard: null` (not absent) for events with
	// no uploaded card — e.g. the real event London GraphQL Spring 2026. The schema
	// accepts that (v.nullish) and the importer falls back to generatedSocialCardURL,
	// rather than throwing and 502-ing the whole import. Fixture is the real,
	// unmodified API response.
	it('imports an event whose uploadedSocialCard is null, via the generated-card fallback (London GraphQL)', async () => {
		stubFetch(guildRoutes(londonGraphql));
		const result = await guildImporter.parseData(
			importContext('https://guild.host/events/london-graphql-spring-tujgnp')
		);
		expect(result?.name).toBe('London GraphQL Spring 2026');
		expect(result?.imageDataUrl).toMatch(/^data:image\//);
	});
});
