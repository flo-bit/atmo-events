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

/** On only when the record says so; a missing or unreadable record is off. */
export function privateEventsBetaOn(record: unknown): boolean {
	return (
		typeof record === 'object' &&
		record !== null &&
		(record as { privateEvents?: unknown }).privateEvents === true
	);
}
