import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";

const _inviteViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("rsvp.atmo.invite.defs#inviteView"),
  ),
  /**
   * Set for community-owned spaces. Absent for user-owned.
   */
  accessLevel: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.string<
      "admin" | "manager" | "member" | "owner" | (string & {})
    >(),
  ),
  /**
   * Unix ms.
   */
  createdAt: /*#__PURE__*/ v.integer(),
  createdBy: /*#__PURE__*/ v.didString(),
  /**
   * Unix ms. Omitted for no expiry.
   */
  expiresAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  /**
   * Set for user-owned spaces. Absent for community-owned.
   */
  kind: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.string<"join" | "read" | "read-join" | (string & {})>(),
  ),
  /**
   * @minimum 1
   */
  maxUses: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
      /*#__PURE__*/ v.integerRange(1),
    ]),
  ),
  /**
   * @maxLength 500
   */
  note: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 500),
    ]),
  ),
  /**
   * Unix ms. Omitted if not revoked.
   */
  revokedAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  spaceUri: /*#__PURE__*/ v.string(),
  /**
   * Stable identifier for list/revoke operations.
   */
  tokenHash: /*#__PURE__*/ v.string(),
  usedCount: /*#__PURE__*/ v.integer(),
});

type inviteView$schematype = typeof _inviteViewSchema;

export interface inviteViewSchema extends inviteView$schematype {}

export const inviteViewSchema = _inviteViewSchema as inviteViewSchema;

export interface InviteView extends v.InferInput<typeof inviteViewSchema> {}
