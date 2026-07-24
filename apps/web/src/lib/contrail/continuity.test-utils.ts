// Shared assertions for the page-1 ↔ load-more continuity tests that sit beside
// each paginated route's +page.server.ts.
import { expect } from 'vitest';

/**
 * A fixed instant for those tests to run at, so page 1 and the resumer compute
 * the same `now()` time bound and it can be compared by value. Install per file:
 *
 *   beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW }));
 *   afterEach(() => vi.useRealTimers());
 *
 * Only `Date` is faked, so async control flow is untouched.
 */
export const FROZEN_NOW = new Date('2026-06-01T12:00:00.000Z');

/**
 * Assert that a route's page-1 `load()` and the load-more resumer continuing it
 * issued the SAME query.
 *
 * A keyset cursor is query-shape-specific, so page 2 is only adjacent to page 1
 * when every other param agrees — sort, order, limit, filters, scope and the
 * time bounds. Hence the full param bags are compared rather than a chosen
 * subset: a param added to one side only is drift, whether or not this helper
 * knows its name. The cursor is the one param that legitimately differs, so it
 * is checked separately — page 1 runs fresh, page 2 threads page 1's raw keyset
 * through unchanged.
 *
 * Requires a frozen clock (see FROZEN_NOW).
 */
export function expectSameQuery(
	page1: Record<string, unknown>,
	page2: Record<string, unknown>,
	rawKeyset: string
): void {
	const { cursor: page1Cursor, ...page1Query } = page1;
	const { cursor: page2Cursor, ...page2Query } = page2;

	expect(page2Query).toEqual(page1Query);
	expect(page1Cursor).toBeUndefined();
	expect(page2Cursor).toBe(rawKeyset);
}
