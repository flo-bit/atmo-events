import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as ComAtprotoLabelDefs from "@atcute/atproto/types/label/defs";
import * as ComAtprotoRepoStrongRef from "@atcute/atproto/types/repo/strongRef";
import * as CommunityLexiconCalendarEvent from "../event.js";
import * as CommunityLexiconCalendarRsvp from "../rsvp.js";

const _appBskyActorProfileSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal(
      "community.lexicon.calendar.rsvp.getRecord#appBskyActorProfile",
    ),
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
const _hydrateEventRecordSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal(
      "community.lexicon.calendar.rsvp.getRecord#hydrateEventRecord",
    ),
  ),
  cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  collection: /*#__PURE__*/ v.nsidString(),
  did: /*#__PURE__*/ v.didString(),
  get record() {
    return /*#__PURE__*/ v.optional(CommunityLexiconCalendarEvent.mainSchema);
  },
  rkey: /*#__PURE__*/ v.string(),
  time_us: /*#__PURE__*/ v.integer(),
  uri: /*#__PURE__*/ v.resourceUriString(),
});
const _mainSchema = /*#__PURE__*/ v.query(
  "community.lexicon.calendar.rsvp.getRecord",
  {
    params: /*#__PURE__*/ v.object({
      /**
       * Number of event records to embed
       * @minimum 1
       * @maximum 50
       */
      hydrateEvent: /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
          /*#__PURE__*/ v.integerRange(1, 50),
        ]),
      ),
      /**
       * Include profile + identity info keyed by DID
       */
      profiles: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
      /**
       * AT URI of the record
       */
      uri: /*#__PURE__*/ v.resourceUriString(),
    }),
    output: {
      type: "lex",
      schema: /*#__PURE__*/ v.object({
        cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
        collection: /*#__PURE__*/ v.nsidString(),
        did: /*#__PURE__*/ v.didString(),
        get event() {
          return /*#__PURE__*/ v.optional(
            /*#__PURE__*/ v.array(hydrateEventRecordSchema),
          );
        },
        /**
         * Total event count
         */
        eventCount: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
        get profiles() {
          return /*#__PURE__*/ v.optional(
            /*#__PURE__*/ v.array(profileEntrySchema),
          );
        },
        get record() {
          return /*#__PURE__*/ v.optional(
            CommunityLexiconCalendarRsvp.mainSchema,
          );
        },
        rkey: /*#__PURE__*/ v.string(),
        time_us: /*#__PURE__*/ v.integer(),
        uri: /*#__PURE__*/ v.resourceUriString(),
      }),
    },
  },
);
const _profileEntrySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal(
      "community.lexicon.calendar.rsvp.getRecord#profileEntry",
    ),
  ),
  cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  collection: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.nsidString()),
  did: /*#__PURE__*/ v.didString(),
  handle: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  get record() {
    return /*#__PURE__*/ v.optional(appBskyActorProfileSchema);
  },
  rkey: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  uri: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.resourceUriString()),
});

type appBskyActorProfile$schematype = typeof _appBskyActorProfileSchema;
type hydrateEventRecord$schematype = typeof _hydrateEventRecordSchema;
type main$schematype = typeof _mainSchema;
type profileEntry$schematype = typeof _profileEntrySchema;

export interface appBskyActorProfileSchema extends appBskyActorProfile$schematype {}
export interface hydrateEventRecordSchema extends hydrateEventRecord$schematype {}
export interface mainSchema extends main$schematype {}
export interface profileEntrySchema extends profileEntry$schematype {}

export const appBskyActorProfileSchema =
  _appBskyActorProfileSchema as appBskyActorProfileSchema;
export const hydrateEventRecordSchema =
  _hydrateEventRecordSchema as hydrateEventRecordSchema;
export const mainSchema = _mainSchema as mainSchema;
export const profileEntrySchema = _profileEntrySchema as profileEntrySchema;

export interface AppBskyActorProfile extends v.InferInput<
  typeof appBskyActorProfileSchema
> {}
export interface HydrateEventRecord extends v.InferInput<
  typeof hydrateEventRecordSchema
> {}
export interface ProfileEntry extends v.InferInput<typeof profileEntrySchema> {}

export interface $params extends v.InferInput<mainSchema["params"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "community.lexicon.calendar.rsvp.getRecord": mainSchema;
  }
}
