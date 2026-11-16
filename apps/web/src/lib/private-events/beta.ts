// The beta switch for private events: one record in the person's own repo, read and written the way
// the preferred social app is. Framework-free, so pages, the server and the OAuth metadata share it.

export const BETA_COLLECTION = 'rsvp.atmo.actor.privateEventsBeta';
export const BETA_RKEY = 'self';

/** Declared when a deployment offers private events; asked for from Settings, and from the offer a
 *  guest sees on a private event once they answer. */
export const BETA_SCOPE = `repo:${BETA_COLLECTION}?action=create&action=update`;

export const BETA_REQUIREMENTS = [
	{ type: 'repo', collection: BETA_COLLECTION, action: 'create' },
	{ type: 'repo', collection: BETA_COLLECTION, action: 'update' }
] as const;

/** What the beta costs, said wherever private events are offered or shown. */
export const BETA_WARNING =
	"Private events are in beta. While they're being built, and when they move to their public release, private events and their answers will be lost.";

/** The same warning where an event's own page has little room. */
export const BETA_WARNING_SHORT =
	'Beta: private events and their answers will be lost when private events are released.';

/** On only when the record says so; a missing or unreadable record is off. */
export function privateEventsBetaOn(record: unknown): boolean {
	return (
		typeof record === 'object' &&
		record !== null &&
		(record as { privateEvents?: unknown }).privateEvents === true
	);
}
