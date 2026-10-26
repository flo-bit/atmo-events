import { describe, it, expect } from 'vitest';
import { importFromUrl, importers } from './index';
import { lumaImporter } from './luma';
import { UpstreamHttpError } from './http';
import { blockRealFetch, importContext, jsonReply, stubFetch } from './test-support';
// Public event and description fields captured from Luma's event/get endpoint.
import toughtech from './__fixtures__/luma-toughtech.json';

const API = 'https://api2.luma.com/event/get';
blockRealFetch();

describe('Luma URL matching', () => {
	it.each([
		['https://luma.com/toughtech-6pg5', true],
		['https://lu.ma/toughtech-6pg5/?utm_source=calendar', true],
		['https://www.luma.com/evt-yKaDEM0lyaAZjnD', true],
		['https://www.lu.ma/toughtech-6pg5', true],
		['https://luma.com/', false],
		['https://luma.com/calendar/example.ics', false],
		['https://luma.com/example.ics', false],
		['https://luma.com/event/manage', false],
		['https://notluma.com/toughtech-6pg5', false],
		['https://luma.com.example.com/toughtech-6pg5', false],
		['not a url', false]
	])('%s -> %s', (url, expected) => {
		expect(lumaImporter.accept(importContext(url))).toBe(expected);
	});
});

describe('Luma import through the pipeline', () => {
	it('runs before any importer that fetches the HTML page', () => {
		const names = importers.map((i) => i.name);
		expect(names.indexOf('luma')).toBeGreaterThanOrEqual(0);
		expect(names.indexOf('luma')).toBeLessThan(names.indexOf('ical'));
		expect(names.indexOf('luma')).toBeLessThan(names.indexOf('webpage'));
	});

	it.each(['luma.com', 'lu.ma'])(
		'imports the real Tough Tech event from %s without fetching HTML',
		async (host) => {
			const { urls } = stubFetch([
				{ when: API, reply: () => jsonReply(toughtech) },
				// A page fetch would reproduce the production failure. It must never happen.
				{ when: `https://${host}/`, reply: () => new Response('rate limited', { status: 429 }) }
			]);
			const result = await importFromUrl(`https://${host}/toughtech-6pg5?utm_source=test`);

			expect(urls).toEqual([`${API}?event_api_id=toughtech-6pg5`]);
			expect(result).toMatchObject({
				source: 'https://luma.com/toughtech-6pg5',
				name: 'Tough Tech Week Kickoff',
				startsAt: '2026-10-26T20:00:00.000Z',
				endsAt: '2026-10-26T23:00:00.000Z',
				timezone: 'America/New_York',
				mode: 'inperson',
				location: { locality: 'Boston', region: 'Massachusetts', country: 'US' },
				imageUrl: toughtech.event.cover_url
			});
			expect(result?.description).toContain('hosted by Wolf & Company and Foley Hoag!');
			expect(result?.description).toContain('\n\n*Confirmed registration is required for entry*');
			// Luma intentionally hides the street from unregistered visitors.
			expect(result?.location?.street).toBeUndefined();
		}
	);

	it('handles an online event with no cover, location or description', async () => {
		stubFetch([
			{
				when: API,
				reply: () =>
					jsonReply({
						event: {
							...toughtech.event,
							location_type: 'online',
							cover_url: null,
							geo_address_info: null,
							end_at: null
						}
					})
			}
		]);
		const result = await importFromUrl('https://luma.com/online-event');
		expect(result?.mode).toBe('virtual');
		expect(result?.imageUrl).toBeUndefined();
		expect(result?.location).toBeUndefined();
		expect(result?.description).toBeUndefined();
		expect(result?.endsAt).toBeUndefined();
	});

	it('keeps explicit line breaks in rich-text descriptions', async () => {
		stubFetch([
			{
				when: API,
				reply: () =>
					jsonReply({
						...toughtech,
						description_mirror: {
							type: 'doc',
							content: [
								{
									type: 'paragraph',
									content: [
										{ type: 'text', text: 'First' },
										{ type: 'hard_break' },
										{ type: 'text', text: 'Second' }
									]
								}
							]
						}
					})
			}
		]);
		expect((await importFromUrl('https://luma.com/test'))?.description).toBe('First\nSecond');
	});

	it('preserves rate-limit status and retry-after when the API itself is limited', async () => {
		const { urls } = stubFetch([
			{
				when: API,
				reply: () =>
					new Response('limited', {
						status: 429,
						headers: { 'retry-after': '60' }
					})
			}
		]);
		const error = await importFromUrl('https://luma.com/toughtech-6pg5').catch((e) => e);
		expect(error).toBeInstanceOf(UpstreamHttpError);
		expect(error).toMatchObject({ status: 429, hostname: 'api2.luma.com', retryAfter: '60' });
		expect(urls).toHaveLength(1); // No retries or fallback to the known-blocked HTML page.
	});

	it('rejects non-event API payloads rather than silently producing an empty import', async () => {
		stubFetch([{ when: API, reply: () => jsonReply({ calendar: {} }) }]);
		await expect(importFromUrl('https://luma.com/some-calendar')).rejects.toThrow();
	});
});
