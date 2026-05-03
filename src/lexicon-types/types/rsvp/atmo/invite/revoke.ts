import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.procedure("rsvp.atmo.invite.revoke", {
  params: null,
  input: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      /**
       * Optional — ownership is inferred from the invite row; required for user-owned spaces for a sanity check.
       */
      spaceUri: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      tokenHash: /*#__PURE__*/ v.string(),
    }),
  },
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      ok: /*#__PURE__*/ v.boolean(),
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
    "rsvp.atmo.invite.revoke": mainSchema;
  }
}
