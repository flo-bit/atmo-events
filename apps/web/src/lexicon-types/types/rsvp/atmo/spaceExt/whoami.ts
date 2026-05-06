import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.query("rsvp.atmo.spaceExt.whoami", {
  params: /*#__PURE__*/ v.object({
    spaceUri: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      /**
       * Only set for community-owned spaces. Null when the caller has no resolvable access.
       */
      accessLevel: /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.string<
          "admin" | "manager" | "member" | "owner" | (string & {})
        >(),
      ),
      isMember: /*#__PURE__*/ v.boolean(),
      isOwner: /*#__PURE__*/ v.boolean(),
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
    "rsvp.atmo.spaceExt.whoami": mainSchema;
  }
}
