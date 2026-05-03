import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoSpaceDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.space.getRecord", {
  params: /*#__PURE__*/ v.object({
    author: /*#__PURE__*/ v.didString(),
    collection: /*#__PURE__*/ v.nsidString(),
    /**
     * Read-grant invite token. When supplied, replaces JWT auth for this read.
     */
    inviteToken: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    rkey: /*#__PURE__*/ v.string(),
    spaceUri: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get record() {
        return RsvpAtmoSpaceDefs.recordViewSchema;
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
    "rsvp.atmo.space.getRecord": mainSchema;
  }
}
