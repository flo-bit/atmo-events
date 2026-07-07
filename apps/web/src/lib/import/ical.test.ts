import { describe, it, expect } from 'vitest';
import { icalImporter } from './ical';
import { importFromUrl } from './index';
import { importContext, stubFetch, textReply, fetchedPage, blockRealFetch } from './test-support';

// ical is a *content-based* importer: accept() and parseData() both consume
// ctx.getPage(). This exercises the harness two ways — driving the importer
// directly with a synthetic FetchedPage, and end-to-end through importFromUrl
// with a stubbed network response (the real fetch + content-sniff path).

const ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'BEGIN:VEVENT',
	'SUMMARY:Team Offsite',
	'DESCRIPTION:Annual planning\\, in the mountains',
	'DTSTART;TZID=America/Denver:20260810T090000',
	'DTEND;TZID=America/Denver:20260810T170000',
	'LOCATION:Aspen Center',
	'URL:https://example.com/offsite',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');

blockRealFetch();

describe('icalImporter.accept (content sniff)', () => {
	it('accepts a text/calendar content-type', async () => {
		const ctx = importContext('https://x/feed', async () =>
			fetchedPage({ contentType: 'text/calendar', text: ICS })
		);
		expect(await icalImporter.accept(ctx)).toBe(true);
	});

	it('accepts a BEGIN:VCALENDAR body even when the content-type is wrong', async () => {
		const ctx = importContext('https://x/feed', async () =>
			fetchedPage({ contentType: 'application/octet-stream', text: ICS })
		);
		expect(await icalImporter.accept(ctx)).toBe(true);
	});

	it('rejects an ordinary HTML page', async () => {
		const ctx = importContext('https://x/', async () =>
			fetchedPage({ contentType: 'text/html', text: '<html><body>not a calendar</body></html>' })
		);
		expect(await icalImporter.accept(ctx)).toBe(false);
	});
});

describe('icalImporter.parseData', () => {
	it('maps the first VEVENT with TZID-aware start/end and unescaped text', async () => {
		const ctx = importContext('https://x/feed', async () =>
			fetchedPage({ finalUrl: 'https://x/feed', contentType: 'text/calendar', text: ICS })
		);

		const result = await icalImporter.parseData(ctx);

		expect(result).toMatchObject({
			source: 'https://x/feed',
			name: 'Team Offsite',
			timezone: 'America/Denver',
			location: { street: 'Aspen Center' },
			links: [{ uri: 'https://example.com/offsite', name: 'Event page' }]
		});
		// August in Denver is MDT (-06:00).
		expect(result?.startsAt).toBe('2026-08-10T09:00:00-06:00');
		expect(result?.endsAt).toBe('2026-08-10T17:00:00-06:00');
		expect(result?.description).toBe('Annual planning, in the mountains');
	});
});

describe('ical through the full pipeline', () => {
	it('routes an .ics feed to the ical importer via the real fetch path', async () => {
		stubFetch([{ when: '/feed.ics', reply: () => textReply(ICS, 'text/calendar') }]);
		const result = await importFromUrl('https://example.com/feed.ics');
		expect(result?.name).toBe('Team Offsite');
		expect(result?.source).toBe('https://example.com/feed.ics');
	});
});
