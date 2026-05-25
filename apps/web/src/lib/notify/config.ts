// atmo.pub notification relay integration — shared constants.
// Docs: https://docs.atmo.pub/llms.txt

/** Relay XRPC base + DID (the `aud` for every app/user service-auth token). */
export const RELAY_ORIGIN = 'https://relay.atmo.pub';
export const RELAY_DID = 'did:web:relay.atmo.pub';

// Lexicon method names (also used as the JWT `lxm` claim).
export const LXM_SEND = 'pub.atmo.notify.send';
export const LXM_REQUEST_PERMISSION = 'pub.atmo.notify.requestPermission';
export const LXM_REVOKE_SELF = 'pub.atmo.notify.revokeSelf';
export const LXM_SUBSCRIBER_CHANGED = 'pub.atmo.notify.subscriberChanged';

/** Shown on the atmo.pub approval screen for our sender DID. */
export const APP_NAME = 'atmo.rsvp';
export const APP_DESCRIPTION =
	'Reminders for events you RSVP to, plus a ping when someone RSVPs to your events.';

/** RSVP statuses that count as "attending" for reminders and host alerts.
 *  Matched as a suffix on `community.lexicon.calendar.rsvp#<status>`. */
export const ATTENDING_SUFFIXES = ['#going', '#interested'] as const;

// Reminder milestones, measured as ms before the event's `startsAt`.
export const REMINDER_24H_MS = 24 * 60 * 60 * 1000;
export const REMINDER_1H_MS = 60 * 60 * 1000;

/** How long after a milestone passes we'll still fire it (tolerates worker
 *  downtime / ingest backlog). Kept small so a late "24h" reminder never lands
 *  hours off; the per-(recipient,event,milestone) dedup key prevents repeats. */
export const REMINDER_CATCHUP_MS = 30 * 60 * 1000;

/** Caps per cron tick — bounds D1 CPU per cycle and the relay's 1/sec-per-pair
 *  rate limit. Leftover work is picked up on subsequent ticks (every minute). */
export const MAX_SENDS_PER_TICK = 40;
export const MAX_NEW_RSVPS_PER_TICK = 100;

export type ReminderKind = 'r24' | 'r1' | 'r0';

export const REMINDER_MILESTONES: { kind: ReminderKind; offsetMs: number }[] = [
	{ kind: 'r24', offsetMs: REMINDER_24H_MS },
	{ kind: 'r1', offsetMs: REMINDER_1H_MS },
	{ kind: 'r0', offsetMs: 0 }
];
