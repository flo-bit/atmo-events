import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoSpaceDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.space.listRecords", {
  params: /*#__PURE__*/ v.object({
    /**
     * Only return records authored by this DID.
     */
    byUser: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.didString()),
    collection: /*#__PURE__*/ v.nsidString(),
    cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * Read-grant invite token. When supplied, replaces JWT auth for this read.
     */
    inviteToken: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * @minimum 1
     * @maximum 200
     * @default 50
     */
    limit: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
        /*#__PURE__*/ v.integerRange(1, 200),
      ]),
      50,
    ),
    spaceUri: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      get records() {
        return /*#__PURE__*/ v.array(RsvpAtmoSpaceDefs.recordViewSchema);
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
    "rsvp.atmo.space.listRecords": mainSchema;
  }
}
