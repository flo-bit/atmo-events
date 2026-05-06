import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoInviteDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.procedure("rsvp.atmo.invite.create", {
  params: null,
  input: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      /**
       * For community-owned spaces. The access level granted on redemption — the creator's own level caps what they can grant.
       */
      accessLevel: /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.string<
          "admin" | "manager" | "member" | "owner" | (string & {})
        >(),
      ),
      /**
       * Unix ms timestamp. Omit for no expiry.
       */
      expiresAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
      /**
       * For user-owned spaces. join: redeem to become a member. read: bearer-only read access, no membership. read-join: anonymous read + signed-in redeem to join.
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
      spaceUri: /*#__PURE__*/ v.string(),
    }),
  },
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get invite() {
        return RsvpAtmoInviteDefs.inviteViewSchema;
      },
      /**
       * Raw token. Shown once — cannot be retrieved later.
       */
      token: /*#__PURE__*/ v.string(),
    }),
  },
});

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface $params {}
export interface $input extends v.InferXRPCBodyInput<mainSchema["input"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCProcedures {
    "rsvp.atmo.invite.create": mainSchema;
  }
}
