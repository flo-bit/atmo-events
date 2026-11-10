import { describe, expect, it } from 'vitest';
import {
	eventDescriptionText,
	eventDescriptionTexts,
	parseEventDescription
} from './event-description';

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('event descriptions', () => {
	it('parses Markdown with facets and detects links only without facets', () => {
		const description = '**@alice.test** see https://example.com';
		const faceted = parseEventDescription({
			description,
			facets: [
				{
					index: { byteStart: bytes('**'), byteEnd: bytes('**@alice.test') },
					features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }]
				}
			]
		});
		const json = JSON.stringify(faceted);
		expect(json).toContain('"type":"strong"');
		expect(json).toContain('"actor":"did:plc:alice"');
		expect(json).not.toContain('"url":"https://example.com/"');
		expect(JSON.stringify(parseEventDescription({ description }))).toContain(
			'"url":"https://example.com/"'
		);
	});

	it('returns nothing for missing or blank descriptions', () => {
		expect(parseEventDescription({})).toBeNull();
		expect(parseEventDescription({ description: ' \n ' })).toBeNull();
		expect(eventDescriptionText({ description: '' })).toBe('');
	});

	it('strips Markdown for plain-text uses', () => {
		expect(eventDescriptionText({ description: '## Talk\n\n- [Slides](https://x.test)' })).toBe(
			'Talk\n\n- Slides'
		);
		expect(
			eventDescriptionTexts([
				{ uri: 'at://a', description: '**A**' },
				{ uri: 'at://b' },
				{ uri: 'at://c', description: '`c`' }
			])
		).toEqual({ 'at://a': 'A', 'at://c': 'c' });
	});

	it('handles pathological input quickly', () => {
		const start = performance.now();
		for (const description of [
			'*'.repeat(100_000) + 'x',
			'- '.repeat(10_000) + 'x',
			'>'.repeat(20_000)
		])
			eventDescriptionText({ description });
		expect(performance.now() - start).toBeLessThan(2000);
	});
});
