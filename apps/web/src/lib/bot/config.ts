/**
 * Config + copy for the `going.atmo.rsvp` reply bot.
 *
 * The bot lets people RSVP to an event by tagging it in a reply to a post that
 * links to an `atmo.rsvp` event. It uses the replier's own OAuth token (stored
 * at login) to write the RSVP record, then likes their reply to confirm — or
 * replies with a hint when it can't act.
 */

/** Public host of atmo.rsvp links we resolve events from. */
export const ATMO_HOSTS = ['atmo.rsvp', 'www.atmo.rsvp'];

/** Default PDS used to authenticate the bot when BOT_PDS_URL is unset. */
export const DEFAULT_BOT_PDS = 'https://bsky.social';

/** Lexicon NSIDs. */
export const RSVP_COLLECTION = 'community.lexicon.calendar.rsvp';
export const EVENT_COLLECTION = 'community.lexicon.calendar.event';
export const LIKE_COLLECTION = 'app.bsky.feed.like';
export const POST_COLLECTION = 'app.bsky.feed.post';

/** Always RSVP as "going" — that's what the handle promises. */
export const RSVP_GOING_STATUS = 'community.lexicon.calendar.rsvp#going';

/** How many notifications to pull per cron tick. */
export const NOTIF_LIMIT = 50;
/** Cap mentions handled per tick so one busy minute can't blow the CPU budget. */
export const MAX_MENTIONS_PER_RUN = 25;

/** Don't re-nag the same person to sign in more than once per day. */
export const NO_TOKEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Don't repeat "no event here" to the same person more than once an hour. */
export const NO_EVENT_COOLDOWN_MS = 60 * 60 * 1000;

/** Reply copy. Kept short; URLs become clickable via link facets. */
export const REPLIES = {
	noToken:
		"To RSVP I need you to sign in once at https://atmo.rsvp — then tag me again and I'll add you 🎟️",
	noEvent:
		"I couldn't find an atmo.rsvp event in this thread. Reply to a post that links to one and tag me again 👋",
	external: (url: string) => `RSVPs for this event are handled on the original site: ${url}`
} as const;

/** Outcomes recorded per processed mention (for dedup + cooldowns + auditing). */
export type BotOutcome =
	| 'liked'
	| 'replied_no_token'
	| 'replied_no_event'
	| 'replied_external'
	| 'skipped_cooldown'
	| 'error';
