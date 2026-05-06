import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as RsvpAtmoSpaceDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.procedure("rsvp.atmo.space.createSpace", {
  params: null,
  input: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get appPolicy() {
        return /*#__PURE__*/ v.optional(RsvpAtmoSpaceDefs.appPolicySchema);
      },
      appPolicyRef: /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.resourceUriString(),
      ),
      /**
       * Space key. Auto-generated (TID) if omitted.
       */
      key: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      /**
       * Space type NSID. Defaults to the service's configured type.
       */
      type: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.nsidString()),
    }),
  },
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

export interface $params {}
export interface $input extends v.InferXRPCBodyInput<mainSchema["input"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCProcedures {
    "rsvp.atmo.space.createSpace": mainSchema;
  }
}
