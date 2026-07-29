import { describe, it, expect } from 'vitest';
import { bySoonestEnding } from './live-order';

/** Order a list the way EventList does, returning the endsAt values in order. */
function ordered(...endsAt: (string | null | undefined)[]): (string | null | undefined)[] {
	return endsAt
		.map((v) => ({ endsAt: v }))
		.sort(bySoonestEnding)
		.map((e) => e.endsAt);
}

describe('bySoonestEnding', () => {
	it('orders plain UTC timestamps soonest-ending first', () => {
		expect(ordered('2026-08-10T17:00:00Z', '2026-08-10T12:00:00Z')).toEqual([
			'2026-08-10T12:00:00Z',
			'2026-08-10T17:00:00Z'
		]);
	});

	it('orders an offset timestamp by its instant, not its text', () => {
		// The bug: as text '2026-08-10T13:00:00+02:00' sorts AFTER
		// '2026-08-10T12:00:00Z', though it ends an hour EARLIER (11:00Z).
		expect(ordered('2026-08-10T12:00:00Z', '2026-08-10T13:00:00+02:00')).toEqual([
			'2026-08-10T13:00:00+02:00',
			'2026-08-10T12:00:00Z'
		]);
		// Pin the text comparison this replaces, so the test fails loudly if
		// someone reverts to localeCompare.
		expect('2026-08-10T13:00:00+02:00'.localeCompare('2026-08-10T12:00:00Z')).toBeGreaterThan(0);
	});

	it('treats the same instant written two ways as equal', () => {
		expect(
			bySoonestEnding({ endsAt: '2026-08-10T12:00:00Z' }, { endsAt: '2026-08-10T14:00:00+02:00' })
		).toBe(0);
	});

	it('ignores millisecond spelling differences that text order would not', () => {
		expect(ordered('2026-08-10T12:00:00Z', '2026-08-10T11:59:59.500Z')).toEqual([
			'2026-08-10T11:59:59.500Z',
			'2026-08-10T12:00:00Z'
		]);
	});

	it('sorts an event with no end last rather than first', () => {
		// Text order put '' ahead of everything, leading a "soonest ending" list
		// with the one card that has no knowable end.
		expect(ordered(undefined, '2026-08-10T12:00:00Z', null)).toEqual([
			'2026-08-10T12:00:00Z',
			undefined,
			null
		]);
	});

	it('is a valid comparator when several ends are unknown', () => {
		// Infinity - Infinity is NaN; a comparator returning NaN corrupts the sort.
		expect(bySoonestEnding({ endsAt: undefined }, { endsAt: 'not a date' })).toBe(0);
		expect(ordered(undefined, 'not a date', '2026-08-10T12:00:00Z')[0]).toBe(
			'2026-08-10T12:00:00Z'
		);
	});
});
