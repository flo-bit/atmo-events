import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoSpaceDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.space.listBlobs", {
  params: /*#__PURE__*/ v.object({
    /**
     * Only blobs uploaded by this DID.
     */
    byUser: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.didString()),
    cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
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
      get blobs() {
        return /*#__PURE__*/ v.array(RsvpAtmoSpaceDefs.blobInfoSchema);
      },
      cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
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
    "rsvp.atmo.space.listBlobs": mainSchema;
  }
}
