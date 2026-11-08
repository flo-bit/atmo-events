import { describe, expect, it } from 'vitest';
import type { FlatEventRecord } from '#lib/contrail.js';
import { eventDescriptionTexts } from '#lib/server/event-description.js';
import { getScheduleEvents } from './schedule-utils';

const talk = {
	uri: 'at://did:plc:host/community.lexicon.calendar.event/talk',
	did: 'did:plc:host',
	rkey: 'talk',
	name: 'Talk',
	startsAt: '2026-11-10T18:00:00Z',
	createdAt: '2026-11-01T12:00:00Z',
	description: '## Plan\n\nBring **snacks** and [slides](https://example.com).',
	additionalData: { isAtmosphereconf: true, type: 'presentation' }
} satisfies FlatEventRecord;

describe('conference description previews', () => {
	it('uses server-produced plain text without mutating source records', () => {
		const descriptions = eventDescriptionTexts([talk]);
		const [scheduled] = getScheduleEvents([talk], descriptions);
		expect(scheduled.description).toBe('Plan\n\nBring snacks and slides.');
		expect(talk.description).toContain('**snacks**');
	});

	it('retains raw-description fallback when no parsed preview is supplied', () => {
		expect(getScheduleEvents([talk])[0].description).toBe(talk.description);
	});

	it('respects explicitly empty preview overrides', () => {
		expect(getScheduleEvents([talk], { [talk.uri]: '' })[0].description).toBe('');
	});
});
