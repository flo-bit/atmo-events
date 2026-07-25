import { describe, expect, it } from 'vitest';
import { hasEnded } from './past-events';

// hasEnded is the shared "is this event over?" predicate the past-events route
// load and its load-more resumer both apply. These pin the two edges that the
// startsAt/endsAt fallback and the strict comparison decide, so neither side can
// quietly re-interpret "past".
const ASOF = '2026-06-01T12:00:00.000Z';

describe('hasEnded', () => {
	it('is over once an event with no endsAt has started', () => {
		expect(hasEnded({ startsAt: '2026-01-01T00:00:00Z', endsAt: undefined }, ASOF)).toBe(true);
	});

	it('is not over when an event with no endsAt has not started yet', () => {
		expect(hasEnded({ startsAt: '2026-12-01T00:00:00Z', endsAt: undefined }, ASOF)).toBe(false);
	});

	it('uses endsAt, not startsAt: a started-but-still-running event is not over', () => {
		expect(
			hasEnded({ startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }, ASOF)
		).toBe(false);
	});

	it('is over when endsAt is in the past', () => {
		expect(
			hasEnded({ startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-03-01T00:00:00Z' }, ASOF)
		).toBe(true);
	});

	it('is NOT over at the exact instant it ends — strict <, so the past/upcoming partition never overlaps', () => {
		expect(hasEnded({ startsAt: '2026-01-01T00:00:00Z', endsAt: ASOF }, ASOF)).toBe(false);
	});
});
