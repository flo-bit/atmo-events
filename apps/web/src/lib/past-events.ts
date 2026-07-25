import type { FlatEventRecord } from '@atmo-dev/events-ui';

/**
 * Has this event finished as of `asOf` (an ISO instant)?
 *
 * The "past events" list bounds its D1 query on startsAt, which still admits an
 * event that began earlier and is STILL RUNNING. Page 1 and the load-more
 * resumer both narrow their results with this predicate, so an ongoing event
 * cannot be filtered off page 1 and then reappear on page 2.
 *
 * An event with no endsAt is treated as over once it has started, matching how
 * the rest of the app approximates duration it was never given.
 */
export function hasEnded(
	event: Pick<FlatEventRecord, 'startsAt' | 'endsAt'>,
	asOf: string
): boolean {
	return new Date(event.endsAt || event.startsAt) < new Date(asOf);
}
