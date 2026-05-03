import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as AppBskyGraphFollow from "../../../app/bsky/graph/follow.js";
import * as ComAtprotoLabelDefs from "@atcute/atproto/types/label/defs";
import * as ComAtprotoRepoStrongRef from "@atcute/atproto/types/repo/strongRef";

const _appBskyActorProfileSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.follow.getRecord#appBskyActorProfile"),
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
const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.follow.getRecord", {
  params: /*#__PURE__*/ v.object({
    /**
     * Read-grant invite token for anonymous bearer access. Replaces JWT auth when supplied.
     */
    inviteToken: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Include profile + identity info keyed by DID
     */
    profiles: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
    /**
     * If set, fetch from this permissioned space (requires service-auth JWT or a read-grant invite token). `ats://` URI.
     */
    spaceUri: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * AT URI of the record
     */
    uri: /*#__PURE__*/ v.resourceUriString(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
      collection: /*#__PURE__*/ v.nsidString(),
      did: /*#__PURE__*/ v.didString(),
      get profiles() {
        return /*#__PURE__*/ v.optional(
          /*#__PURE__*/ v.array(profileEntrySchema),
        );
      },
      rkey: /*#__PURE__*/ v.string(),
      /**
       * Present when the record was read from a permissioned space; its value is the `ats://` space URI.
       */
      space: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      time_us: /*#__PURE__*/ v.integer(),
      uri: /*#__PURE__*/ v.resourceUriString(),
      get value() {
        return AppBskyGraphFollow.mainSchema;
      },
    }),
  },
});
const _profileEntrySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.follow.getRecord#profileEntry"),
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

type appBskyActorProfile$schematype = typeof _appBskyActorProfileSchema;
type main$schematype = typeof _mainSchema;
type profileEntry$schematype = typeof _profileEntrySchema;

export interface appBskyActorProfileSchema extends appBskyActorProfile$schematype {}
export interface mainSchema extends main$schematype {}
export interface profileEntrySchema extends profileEntry$schematype {}

export const appBskyActorProfileSchema =
  _appBskyActorProfileSchema as appBskyActorProfileSchema;
export const mainSchema = _mainSchema as mainSchema;
export const profileEntrySchema = _profileEntrySchema as profileEntrySchema;

export interface AppBskyActorProfile extends v.InferInput<
  typeof appBskyActorProfileSchema
> {}
export interface ProfileEntry extends v.InferInput<typeof profileEntrySchema> {}

export interface $params extends v.InferInput<mainSchema["params"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "rsvp.atmo.follow.getRecord": mainSchema;
  }
}
