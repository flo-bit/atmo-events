import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.space.getBlob", {
  params: /*#__PURE__*/ v.object({
    cid: /*#__PURE__*/ v.cidString(),
    /**
     * Read-grant invite token for anonymous bearer access.
     */
    inviteToken: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    spaceUri: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "blob",
  },
});

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface $params extends v.InferInput<mainSchema["params"]> {}
export type $output = v.InferXRPCBodyInput<mainSchema["output"]>;

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "rsvp.atmo.space.getBlob": mainSchema;
  }
}
