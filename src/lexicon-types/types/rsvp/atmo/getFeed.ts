import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as ComAtprotoLabelDefs from "@atcute/atproto/types/label/defs";
import * as ComAtprotoRepoStrongRef from "@atcute/atproto/types/repo/strongRef";
import * as CommunityLexiconCalendarEvent from "../../community/lexicon/calendar/event.js";
import * as CommunityLexiconCalendarRsvp from "../../community/lexicon/calendar/rsvp.js";

const _appBskyActorProfileSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#appBskyActorProfile"),
  ),
  /**
   * Small image to be displayed next to posts from account. AKA, 'profile picture'
   * @accept image/png, image/jpeg
   * @maxSize 1000000
   */
  avatar: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.blob()),
  /**
   * Larger horizontal image to display behind profile view.
   * @accept image/png, image/jpeg
   * @maxSize 1000000
   */
  banner: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.blob()),
  createdAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  /**
   * Free-form profile description text.
   * @maxLength 2560
   * @maxGraphemes 256
   */
  description: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 2560),
      /*#__PURE__*/ v.stringGraphemes(0, 256),
    ]),
  ),
  /**
   * @maxLength 640
   * @maxGraphemes 64
   */
  displayName: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 640),
      /*#__PURE__*/ v.stringGraphemes(0, 64),
    ]),
  ),
  get joinedViaStarterPack() {
    return /*#__PURE__*/ v.optional(ComAtprotoRepoStrongRef.mainSchema);
  },
  /**
   * Self-label values, specific to the Bluesky application, on the overall account.
   */
  get labels() {
    return /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.variant([ComAtprotoLabelDefs.selfLabelsSchema]),
    );
  },
  get pinnedPost() {
    return /*#__PURE__*/ v.optional(ComAtprotoRepoStrongRef.mainSchema);
  },
  /**
   * Free-form pronouns text.
   * @maxLength 200
   * @maxGraphemes 20
   */
  pronouns: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 200),
      /*#__PURE__*/ v.stringGraphemes(0, 20),
    ]),
  ),
  website: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
});
const _feedRecord_eventSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#feedRecord_event"),
  ),
  cid: /*#__PURE__*/ v.cidString(),
  collection: /*#__PURE__*/ v.nsidString(),
  did: /*#__PURE__*/ v.didString(),
  rkey: /*#__PURE__*/ v.string(),
  get rsvps() {
    return /*#__PURE__*/ v.optional(hydrateRsvpsSchema);
  },
  /**
   * Total rsvps count
   */
  rsvpsCount: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  /**
   * rsvps count where status = going
   */
  rsvpsGoingCount: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  /**
   * rsvps count where status = interested
   */
  rsvpsInterestedCount: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  /**
   * rsvps count where status = notgoing
   */
  rsvpsNotgoingCount: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  /**
   * Present when the record was read from a permissioned space; its value is the `ats://` space URI.
   */
  space: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  time_us: /*#__PURE__*/ v.integer(),
  uri: /*#__PURE__*/ v.resourceUriString(),
  get value() {
    return CommunityLexiconCalendarEvent.mainSchema;
  },
});
const _feedRecord_rsvpSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#feedRecord_rsvp"),
  ),
  cid: /*#__PURE__*/ v.cidString(),
  collection: /*#__PURE__*/ v.nsidString(),
  did: /*#__PURE__*/ v.didString(),
  get event() {
    return /*#__PURE__*/ v.optional(refEventRecordSchema);
  },
  rkey: /*#__PURE__*/ v.string(),
  /**
   * Present when the record was read from a permissioned space; its value is the `ats://` space URI.
   */
  space: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  time_us: /*#__PURE__*/ v.integer(),
  uri: /*#__PURE__*/ v.resourceUriString(),
  get value() {
    return CommunityLexiconCalendarRsvp.mainSchema;
  },
});
const _hydrateRsvpsSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#hydrateRsvps"),
  ),
  get going() {
    return /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(hydrateRsvpsRecordSchema),
    );
  },
  get interested() {
    return /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(hydrateRsvpsRecordSchema),
    );
  },
  get notgoing() {
    return /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(hydrateRsvpsRecordSchema),
    );
  },
  get other() {
    return /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(hydrateRsvpsRecordSchema),
    );
  },
});
const _hydrateRsvpsRecordSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#hydrateRsvpsRecord"),
  ),
  cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  collection: /*#__PURE__*/ v.nsidString(),
  did: /*#__PURE__*/ v.didString(),
  get record() {
    return /*#__PURE__*/ v.optional(CommunityLexiconCalendarRsvp.mainSchema);
  },
  rkey: /*#__PURE__*/ v.string(),
  /**
   * Present when the record was read from a permissioned space; `ats://` URI.
   */
  space: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  time_us: /*#__PURE__*/ v.integer(),
  uri: /*#__PURE__*/ v.resourceUriString(),
});
const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.getFeed", {
  params: /*#__PURE__*/ v.object({
    /**
     * DID or handle of the requesting user
     */
    actor: /*#__PURE__*/ v.actorIdentifierString(),
    /**
     * Filter by target collection (defaults to first target)
     */
    collection: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.string<
        | "community.lexicon.calendar.event"
        | "community.lexicon.calendar.rsvp"
        | (string & {})
      >(),
    ),
    /**
     * Maximum value for createdAt
     */
    createdAtMax: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Minimum value for createdAt
     */
    createdAtMin: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Filter by description
     */
    description: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Maximum value for endsAt
     */
    endsAtMax: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Minimum value for endsAt
     */
    endsAtMin: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Feed name
     */
    feed: /*#__PURE__*/ v.string<"network" | (string & {})>(),
    /**
     * Embed the referenced event record
     */
    hydrateEvent: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
    /**
     * Number of rsvps records to embed per record
     * @minimum 1
     * @maximum 50
     */
    hydrateRsvps: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
        /*#__PURE__*/ v.integerRange(1, 50),
      ]),
    ),
    /**
     * @minimum 1
     * @maximum 200
     * @default 50
     */
    limit: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
        /*#__PURE__*/ v.integerRange(1, 200),
      ]),
      50,
    ),
    /**
     * Filter by mode
     */
    mode: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Filter by name
     */
    name: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Sort direction
     */
    order: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.string<"asc" | "desc" | (string & {})>(),
    ),
    /**
     * Filter by preferences.showInDiscovery
     */
    preferencesShowInDiscovery: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.string(),
    ),
    /**
     * Include profile + identity info keyed by DID
     */
    profiles: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
    /**
     * Minimum total rsvps count
     */
    rsvpsCountMin: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
    /**
     * Minimum rsvps count where status = going
     */
    rsvpsGoingCountMin: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
    /**
     * Minimum rsvps count where status = interested
     */
    rsvpsInterestedCountMin: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.integer(),
    ),
    /**
     * Minimum rsvps count where status = notgoing
     */
    rsvpsNotgoingCountMin: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
    /**
     * Full-text search
     */
    search: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Field to sort by (default: time_us)
     */
    sort: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.string<
        | "createdAt"
        | "description"
        | "endsAt"
        | "mode"
        | "name"
        | "preferencesShowInDiscovery"
        | "rsvpsCount"
        | "rsvpsGoingCount"
        | "rsvpsInterestedCount"
        | "rsvpsNotgoingCount"
        | "startsAt"
        | "status"
        | "subjectUri"
        | (string & {})
      >(),
    ),
    /**
     * Maximum value for startsAt
     */
    startsAtMax: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Minimum value for startsAt
     */
    startsAtMin: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Filter by status
     */
    status: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Filter by subject.uri
     */
    subjectUri: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      get profiles() {
        return /*#__PURE__*/ v.optional(
          /*#__PURE__*/ v.array(profileEntrySchema),
        );
      },
      get records() {
        return /*#__PURE__*/ v.array(
          /*#__PURE__*/ v.variant([
            feedRecord_eventSchema,
            feedRecord_rsvpSchema,
          ]),
        );
      },
    }),
  },
});
const _profileEntrySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#profileEntry"),
  ),
  cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
  collection: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.nsidString()),
  did: /*#__PURE__*/ v.didString(),
  handle: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  rkey: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  uri: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.resourceUriString()),
  get value() {
    return /*#__PURE__*/ v.optional(appBskyActorProfileSchema);
  },
});
const _refEventRecordSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.getFeed#refEventRecord"),
  ),
  cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  collection: /*#__PURE__*/ v.nsidString(),
  did: /*#__PURE__*/ v.didString(),
  get record() {
    return /*#__PURE__*/ v.optional(CommunityLexiconCalendarEvent.mainSchema);
  },
  rkey: /*#__PURE__*/ v.string(),
  /**
   * Present when the record was read from a permissioned space; `ats://` URI.
   */
  space: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  time_us: /*#__PURE__*/ v.integer(),
  uri: /*#__PURE__*/ v.resourceUriString(),
});

type appBskyActorProfile$schematype = typeof _appBskyActorProfileSchema;
type feedRecord_event$schematype = typeof _feedRecord_eventSchema;
type feedRecord_rsvp$schematype = typeof _feedRecord_rsvpSchema;
type hydrateRsvps$schematype = typeof _hydrateRsvpsSchema;
type hydrateRsvpsRecord$schematype = typeof _hydrateRsvpsRecordSchema;
type main$schematype = typeof _mainSchema;
type profileEntry$schematype = typeof _profileEntrySchema;
type refEventRecord$schematype = typeof _refEventRecordSchema;

export interface appBskyActorProfileSchema extends appBskyActorProfile$schematype {}
export interface feedRecord_eventSchema extends feedRecord_event$schematype {}
export interface feedRecord_rsvpSchema extends feedRecord_rsvp$schematype {}
export interface hydrateRsvpsSchema extends hydrateRsvps$schematype {}
export interface hydrateRsvpsRecordSchema extends hydrateRsvpsRecord$schematype {}
export interface mainSchema extends main$schematype {}
export interface profileEntrySchema extends profileEntry$schematype {}
export interface refEventRecordSchema extends refEventRecord$schematype {}

export const appBskyActorProfileSchema =
  _appBskyActorProfileSchema as appBskyActorProfileSchema;
export const feedRecord_eventSchema =
  _feedRecord_eventSchema as feedRecord_eventSchema;
export const feedRecord_rsvpSchema =
  _feedRecord_rsvpSchema as feedRecord_rsvpSchema;
export const hydrateRsvpsSchema = _hydrateRsvpsSchema as hydrateRsvpsSchema;
export const hydrateRsvpsRecordSchema =
  _hydrateRsvpsRecordSchema as hydrateRsvpsRecordSchema;
export const mainSchema = _mainSchema as mainSchema;
export const profileEntrySchema = _profileEntrySchema as profileEntrySchema;
export const refEventRecordSchema =
  _refEventRecordSchema as refEventRecordSchema;

export interface AppBskyActorProfile extends v.InferInput<
  typeof appBskyActorProfileSchema
> {}
export interface FeedRecord_event extends v.InferInput<
  typeof feedRecord_eventSchema
> {}
export interface FeedRecord_rsvp extends v.InferInput<
  typeof feedRecord_rsvpSchema
> {}
export interface HydrateRsvps extends v.InferInput<typeof hydrateRsvpsSchema> {}
export interface HydrateRsvpsRecord extends v.InferInput<
  typeof hydrateRsvpsRecordSchema
> {}
export interface ProfileEntry extends v.InferInput<typeof profileEntrySchema> {}
export interface RefEventRecord extends v.InferInput<
  typeof refEventRecordSchema
> {}

export interface $params extends v.InferInput<mainSchema["params"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "rsvp.atmo.getFeed": mainSchema;
  }
}
