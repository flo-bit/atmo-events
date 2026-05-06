import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";

const _appPolicySchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.space.defs#appPolicy"),
  ),
  apps: /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
  /**
   * 'allow' = default-allow with apps[] as denylist; 'deny' = default-deny with apps[] as allowlist.
   */
  mode: /*#__PURE__*/ v.string<"allow" | "deny" | (string & {})>(),
});
const _blobInfoSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.space.defs#blobInfo"),
  ),
  authorDid: /*#__PURE__*/ v.didString(),
  cid: /*#__PURE__*/ v.cidString(),
  createdAt: /*#__PURE__*/ v.integer(),
  mimeType: /*#__PURE__*/ v.string(),
  size: /*#__PURE__*/ v.integer(),
});
const _inviteViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.space.defs#inviteView"),
  ),
  createdAt: /*#__PURE__*/ v.integer(),
  createdBy: /*#__PURE__*/ v.didString(),
  expiresAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  kind: /*#__PURE__*/ v.string<"join" | "read" | "read-join" | (string & {})>(),
  maxUses: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  note: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  revokedAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  spaceUri: /*#__PURE__*/ v.string(),
  tokenHash: /*#__PURE__*/ v.string(),
  usedCount: /*#__PURE__*/ v.integer(),
});
const _memberViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.space.defs#memberView"),
  ),
  addedAt: /*#__PURE__*/ v.integer(),
  addedBy: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.didString()),
  did: /*#__PURE__*/ v.didString(),
});
const _recordViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.space.defs#recordView"),
  ),
  authorDid: /*#__PURE__*/ v.didString(),
  cid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
  collection: /*#__PURE__*/ v.nsidString(),
  createdAt: /*#__PURE__*/ v.integer(),
  record: /*#__PURE__*/ v.unknown(),
  rkey: /*#__PURE__*/ v.string(),
  spaceUri: /*#__PURE__*/ v.string(),
});
const _spaceViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.space.defs#spaceView"),
  ),
  /**
   * Owner-only
   */
  get appPolicy() {
    return /*#__PURE__*/ v.optional(appPolicySchema);
  },
  appPolicyRef: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.resourceUriString()),
  createdAt: /*#__PURE__*/ v.integer(),
  key: /*#__PURE__*/ v.string(),
  ownerDid: /*#__PURE__*/ v.didString(),
  serviceDid: /*#__PURE__*/ v.string(),
  type: /*#__PURE__*/ v.nsidString(),
  uri: /*#__PURE__*/ v.string(),
});

type appPolicy$schematype = typeof _appPolicySchema;
type blobInfo$schematype = typeof _blobInfoSchema;
type inviteView$schematype = typeof _inviteViewSchema;
type memberView$schematype = typeof _memberViewSchema;
type recordView$schematype = typeof _recordViewSchema;
type spaceView$schematype = typeof _spaceViewSchema;

export interface appPolicySchema extends appPolicy$schematype {}
export interface blobInfoSchema extends blobInfo$schematype {}
export interface inviteViewSchema extends inviteView$schematype {}
export interface memberViewSchema extends memberView$schematype {}
export interface recordViewSchema extends recordView$schematype {}
export interface spaceViewSchema extends spaceView$schematype {}

export const appPolicySchema = _appPolicySchema as appPolicySchema;
export const blobInfoSchema = _blobInfoSchema as blobInfoSchema;
export const inviteViewSchema = _inviteViewSchema as inviteViewSchema;
export const memberViewSchema = _memberViewSchema as memberViewSchema;
export const recordViewSchema = _recordViewSchema as recordViewSchema;
export const spaceViewSchema = _spaceViewSchema as spaceViewSchema;

export interface AppPolicy extends v.InferInput<typeof appPolicySchema> {}
export interface BlobInfo extends v.InferInput<typeof blobInfoSchema> {}
export interface InviteView extends v.InferInput<typeof inviteViewSchema> {}
export interface MemberView extends v.InferInput<typeof memberViewSchema> {}
export interface RecordView extends v.InferInput<typeof recordViewSchema> {}
export interface SpaceView extends v.InferInput<typeof spaceViewSchema> {}
