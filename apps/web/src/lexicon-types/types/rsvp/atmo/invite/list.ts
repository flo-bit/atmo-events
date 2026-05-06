import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoInviteDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.invite.list", {
  params: /*#__PURE__*/ v.object({
    /**
     * @default false
     */
    includeRevoked: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean(), false),
    spaceUri: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get invites() {
        return /*#__PURE__*/ v.array(RsvpAtmoInviteDefs.inviteViewSchema);
      },
    }),
  },
});

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface $params extends v.InferInput<mainSchema["params"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "rsvp.atmo.invite.list": mainSchema;
  }
}
