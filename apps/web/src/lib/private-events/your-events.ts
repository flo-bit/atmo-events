// A person's own private events in the home page's Your events, beside their public ones. Pure, so the
// page's load decides when to ask for them and this only puts them in order.
import type { FlatEventRecord } from '#lib/contrail.js';
import type { MyPrivateEvent } from './server/events';

/** Where a private event in Your events lives. */
export interface PrivateLink {
	href: string;
}

interface YourEvents {
	upcoming: FlatEventRecord[];
	past: FlatEventRecord[];
	/** By event URI, for the private ones only. */
	privateLinks: Record<string, PrivateLink>;
}

const endOf = (event: FlatEventRecord) => new Date(event.endsAt || event.startsAt).getTime();
const startOf = (event: FlatEventRecord) => new Date(event.startsAt).getTime();

/** Their public events with their private ones added: upcoming soonest first, past latest first, and
 *  a private one that ended before `cutoff` left out, as a public one is. */
export function withPrivateEvents(
	mine: { upcoming: FlatEventRecord[]; past: FlatEventRecord[] },
	privateEvents: MyPrivateEvent[],
	now: number,
	cutoff: number
): YourEvents {
	const privateLinks: Record<string, PrivateLink> = {};
	const upcoming = [...mine.upcoming];
	const past = [...mine.past];
	for (const item of privateEvents) {
		const { event } = item;
		if (endOf(event) < cutoff || privateLinks[event.uri]) continue;
		privateLinks[event.uri] = { href: item.href };
		(endOf(event) >= now ? upcoming : past).push(event);
	}
	upcoming.sort((a, b) => startOf(a) - startOf(b));
	past.sort((a, b) => startOf(b) - startOf(a));
	return { upcoming, past, privateLinks };
}
