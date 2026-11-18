import { singleEvent } from '#lib/private-events/ids.js';
import { loadEventPage } from '#lib/private-events/server/event-page.js';
import { readPrivateEventPage } from '#lib/private-events/server/events.js';

/** Byte for byte, so someone kept out can't tell an event that exists from one that doesn't, or from
 *  one that was cancelled. */
const EVENT_NOT_AVAILABLE =
	"This event isn't available. It may have been cancelled, or you may not be on its guest list.";

// Reading it asks the host's server, which learns who is asking and when. A guest was once asked to
// choose that first; it cost every guest a click on every event, so the read is direct.
export function load(event) {
	return loadEventPage(event, EVENT_NOT_AVAILABLE, (caller, host) =>
		readPrivateEventPage(caller, singleEvent(host, event.params.rkey))
	);
}
