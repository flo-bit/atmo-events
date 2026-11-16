import { describe, expect, it } from 'vitest';
import { EVENT_COLLECTION, eventSpace, eventUri, privateEventPath, singleEvent } from './ids';

const HOST = 'did:plc:hosthosthosthosthosthost';

describe('where a private event is', () => {
	it('keeps a single event in a space of its own, under the event’s key', () => {
		const event = singleEvent(HOST, '3lzzzzzzzzzzz');
		expect(eventSpace(event)).toBe(
			`at://${HOST}/space/community.lexicon.calendar.collection/3lzzzzzzzzzzz`
		);
		expect(eventUri(event)).toBe(
			`at://${HOST}/space/community.lexicon.calendar.collection/3lzzzzzzzzzzz/${HOST}/${EVENT_COLLECTION}/3lzzzzzzzzzzz`
		);
	});

	it('gives a single event the page it always had', () => {
		expect(privateEventPath('host.example.com', '3lzzzzzzzzzzz')).toBe(
			'/p/host.example.com/private/3lzzzzzzzzzzz'
		);
	});
});
