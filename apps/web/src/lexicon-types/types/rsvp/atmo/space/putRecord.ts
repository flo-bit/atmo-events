import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.procedure("rsvp.atmo.space.putRecord", {
  params: null,
  input: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      collection: /*#__PURE__*/ v.nsidString(),
      record: /*#__PURE__*/ v.unknown(),
      rkey: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      spaceUri: /*#__PURE__*/ v.string(),
    }),
  },
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      authorDid: /*#__PURE__*/ v.didString(),
      createdAt: /*#__PURE__*/ v.integer(),
      rkey: /*#__PURE__*/ v.string(),
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
    "rsvp.atmo.space.putRecord": mainSchema;
  }
}
