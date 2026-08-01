import { describe, expect, it } from 'vitest';
import { generateICalEvent } from './ical';
import { locationFullLabel } from '@atmo-dev/events-ui/location-summary';
import type { EventData } from '../event-types';

const BASE_EVENT: EventData = {
	createdAt: '2026-07-24T12:00:00Z',
	name: 'Location test',
	startsAt: '2026-08-01T18:00:00Z'
};

const uri = 'at://did:plc:test/community.lexicon.calendar.event/loc';

function locationLine(locations: EventData['locations']): string | undefined {
	return generateICalEvent({ ...BASE_EVENT, locations }, uri)
		.split('\r\n')
		.find((line) => line.startsWith('LOCATION:'));
}

/** What the LOCATION string should SAY is `locationFullLabel`'s to decide, and it is
 *  tested against the full table of records in packages/ui/src/location-summary.test.ts.
 *  This exporter used to carry its own copy of those rules, pinned to a duplicated
 *  139-line table; the copy drifted anyway, because a shared table only guards the
 *  cases someone remembered to write into both halves. Now there is one implementation
 *  and one table.
 *
 *  What is left to test here is what this file actually owns: that the exporter calls
 *  the shared formatter at all, wraps it in a well-formed LOCATION line, applies RFC
 *  5545 escaping to it, and omits the line when there is nothing to say. */
describe('generateICalEvent — LOCATION', () => {
	it('emits what the shared formatter returns, RFC 5545 escaped', () => {
		const locations = [
			{
				$type: 'community.lexicon.location.address',
				name: 'Humboldt Park',
				locality: 'Chicago',
				region: 'Illinois',
				country: 'US'
			}
		];

		// The tie to the package: assert against the formatter's own output rather than
		// a hand-copied string, so this cannot drift from it the way the old copy did.
		const label = locationFullLabel(locations);
		expect(label).toBe('Humboldt Park, Chicago, Illinois, US');
		expect(locationLine(locations)).toBe(`LOCATION:${label!.replaceAll(',', '\\,')}`);
	});

	it('escapes every RFC 5545 special character the formatter can pass through', () => {
		// Commas arrive from the formatter's own joins; semicolons and backslashes only
		// from record text. All three must be escaped or the VEVENT is malformed.
		const line = locationLine([
			{
				$type: 'community.lexicon.location.address',
				name: 'A;B\\C',
				locality: 'Chicago',
				country: 'US'
			}
		]);
		expect(line).toBe('LOCATION:A\\;B\\\\C\\, Chicago\\, US');
	});

	it('omits the line entirely when the formatter has nothing to say', () => {
		// Undefined from the formatter must become NO LOCATION line — not an empty one,
		// which some calendar clients render as a blank location field.
		expect(locationFullLabel([])).toBeUndefined();
		expect(locationLine([])).toBeUndefined();
		expect(locationLine(undefined)).toBeUndefined();
		// A record that is nothing but the 0,0 sentinel: no position, so no line.
		expect(
			locationLine([{ $type: 'community.lexicon.location.geo', latitude: '0', longitude: '0' }])
		).toBeUndefined();
	});

	it('keeps the room prefix ahead of the formatted location', () => {
		// The room comes from additionalData, not from locations[], so it is this
		// exporter's own concern and survives the delegation.
		const ical = generateICalEvent(
			{
				...BASE_EVENT,
				additionalData: { room: 'Room 2' },
				locations: [
					{ $type: 'community.lexicon.location.address', locality: 'Chicago', country: 'US' }
				]
			} as EventData,
			uri
		);
		expect(ical).toContain('LOCATION:Room 2\\, Chicago\\, US\r\n');
	});
});
