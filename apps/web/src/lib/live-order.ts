// How the live band is ordered: soonest-ending first.
//
// A module rather than a closure inside EventList, for the reason `dedupe-by-uri`
// is one — a mis-ordered list still looks like a list, so this is exactly the
// kind of logic that needs a test rather than an eye.

/** The instant an event ends, as a number for ordering. Absent or unparseable
 *  sorts LAST: a card with no knowable finish should not lead a list whose whole
 *  claim is what finishes soonest. */
function endsAtInstant(event: { endsAt?: string | null }): number {
	const ms = event.endsAt ? Date.parse(event.endsAt) : NaN;
	return Number.isNaN(ms) ? Infinity : ms;
}

/**
 * Compare two events by WHEN THEY END — by the instant each timestamp names,
 * never by its text.
 *
 * The distinction is not academic here. These records are hydrated from D1
 * exactly as they were written, and RFC 3339 permits a zone offset which the
 * importers preserve verbatim (an .ics in Denver yields
 * `2026-08-10T09:00:00-06:00`; see lib/import/ical.test.ts). Compared as
 * strings, `13:00+02:00` sorts AFTER a `12:00Z` that it actually precedes by an
 * hour — so the band would name the wrong event as finishing first, in a
 * section whose only ordering claim is that one.
 *
 * The search index avoids this by normalizing at write time (see
 * search/server/normalize.ts), but nothing normalizes the records that reach the
 * browser: the search path indexes normalized timestamps and then hydrates the
 * ORIGINALS for display. This is where that gap is closed.
 */
export function bySoonestEnding(
	a: { endsAt?: string | null },
	b: { endsAt?: string | null }
): number {
	const x = endsAtInstant(a);
	const y = endsAtInstant(b);
	return x === y ? 0 : x < y ? -1 : 1;
}
