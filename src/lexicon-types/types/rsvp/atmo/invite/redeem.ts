import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.procedure("rsvp.atmo.invite.redeem", {
  params: null,
  input: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      token: /*#__PURE__*/ v.string(),
    }),
  },
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      /**
       * Set for community-owned spaces — the level granted.
       */
      accessLevel: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      /**
       * Set for community-owned spaces.
       */
      communityDid: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.didString()),
      /**
       * Set for user-owned spaces — echoes the invite kind consumed.
       */
      kind: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      spaceUri: /*#__PURE__*/ v.string(),
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
    "rsvp.atmo.invite.redeem": mainSchema;
  }
}
