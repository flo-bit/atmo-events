import { describe, it, expect } from 'vitest';
import { importFromUrl } from './index';
import { stubFetch, textReply, blockRealFetch } from './test-support';

// webpage is the generic HTML fallback (Luma/Meetup/Eventbrite/Partiful/…). It
// parses JSON-LD, then OpenGraph, and guesses an IANA zone from an ISO offset.
// Driven end-to-end through importFromUrl with a stubbed HTML response — the
// same harness, now feeding an HTML document instead of a JSON API.

const JSONLD_HTML = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
	'@context': 'https://schema.org',
	'@type': 'Event',
	name: 'Downtown Art Walk',
	description: '<p>Galleries open late.</p>',
	startDate: '2026-09-12T18:00:00-04:00',
	endDate: '2026-09-12T21:00:00-04:00',
	eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
	location: {
		'@type': 'Place',
		name: 'Main Gallery',
		address: {
			'@type': 'PostalAddress',
			streetAddress: '100 Main St',
			addressLocality: 'Louisville',
			addressRegion: 'KY',
			addressCountry: 'US'
		}
	},
	image: 'https://img.example/artwalk.jpg',
	url: 'https://example.com/artwalk'
})}</script></head><body>Art Walk</body></html>`;

const OG_HTML = `<html><head>
	<meta property="og:title" content="Open Mic Night">
	<meta property="og:description" content="Sign up at the door">
	<meta property="og:image" content="https://img.example/mic.jpg">
</head><body>Open mic</body></html>`;

blockRealFetch();

describe('webpage importer (HTML fallback) through the pipeline', () => {
	it('extracts a schema.org Event from JSON-LD, stripping HTML and guessing the zone', async () => {
		stubFetch([{ when: '/artwalk', reply: () => textReply(JSONLD_HTML) }]);

		const result = await importFromUrl('https://example.com/artwalk');

		expect(result).toMatchObject({
			source: 'https://example.com/artwalk',
			name: 'Downtown Art Walk',
			mode: 'inperson', // OfflineEventAttendanceMode
			startsAt: '2026-09-12T18:00:00-04:00',
			endsAt: '2026-09-12T21:00:00-04:00',
			location: {
				street: 'Main Gallery, 100 Main St',
				locality: 'Louisville',
				region: 'KY',
				country: 'US'
			},
			imageUrl: 'https://img.example/artwalk.jpg'
		});
		expect(result?.description).toBe('Galleries open late.'); // <p> stripped
		expect(result?.timezone).toBe('America/New_York'); // -04:00 in September
	});

	it('falls back to OpenGraph tags when there is no JSON-LD', async () => {
		stubFetch([{ when: '/mic', reply: () => textReply(OG_HTML) }]);

		const result = await importFromUrl('https://example.com/mic');

		expect(result).toMatchObject({
			source: 'https://example.com/mic',
			name: 'Open Mic Night',
			description: 'Sign up at the door',
			imageUrl: 'https://img.example/mic.jpg'
		});
	});

	it('returns null when the page has neither structured data nor OpenGraph', async () => {
		stubFetch([{ when: '/plain', reply: () => textReply('<html><body>just text</body></html>') }]);
		const result = await importFromUrl('https://example.com/plain');
		expect(result).toBeNull();
	});
});
