import { describe, expect, it } from 'vitest';
import { generateICalEvent, generateICalFeed } from './ical';
import type { EventData } from '#lib/event-types.js';

const event: EventData = {
	name: 'Meetup',
	startsAt: '2026-11-10T18:00:00Z',
	createdAt: '2026-11-01T12:00:00Z'
};
const uri = 'at://did:plc:host/community.lexicon.calendar.event/event';

// Unfold RFC 5545 continuation lines before checking field values.
const unfold = (text: string) => text.replace(/\r\n /g, '');

describe('calendar descriptions', () => {
	it('exports Markdown as escaped plain text and retains event links', () => {
		const calendar = unfold(
			generateICalFeed(
				[
					{
						eventData: {
							...event,
							description: '## Plan\n\nBring **snacks**, tea; [details](https://example.com).',
							uris: [{ name: 'Website', uri: 'https://example.com' }]
						},
						uid: uri,
						url: 'https://atmo.rsvp/p/host/e/event'
					}
				],
				'Meetups'
			)
		);
		expect(calendar).toContain(
			'DESCRIPTION:Plan\\n\\nBring snacks\\, tea\\; details.\\n\\nLinks:' +
				'\\nWebsite: https://example.com\\n\\nEvent page: https://atmo.rsvp/p/host/e/event\r\n'
		);
		expect(calendar).not.toContain('**snacks**');
		expect(calendar).not.toContain('[details](');
	});

	it('omits blank descriptions', () => {
		const calendar = generateICalEvent({ ...event, description: ' \n ' }, uri);
		expect(calendar.split('\r\n').filter((line) => line.startsWith('DESCRIPTION:'))).toEqual([
			'DESCRIPTION:Meetup' // The reminder still has its own description.
		]);
	});

	it('keeps raw HTML literal in plain-text calendar fields', () => {
		const calendar = unfold(
			generateICalEvent({ ...event, description: '**Hello** <script>test</script>' }, uri)
		);
		expect(calendar).toContain('DESCRIPTION:Hello <script>test</script>\r\n');
	});
});
