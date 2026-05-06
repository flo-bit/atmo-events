import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoSpaceDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.space.getSpace", {
  params: /*#__PURE__*/ v.object({
    /**
     * Read-grant invite token. When supplied, replaces JWT auth for this read.
     */
    inviteToken: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    uri: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get space() {
        return RsvpAtmoSpaceDefs.spaceViewSchema;
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
    "rsvp.atmo.space.getSpace": mainSchema;
  }
}
