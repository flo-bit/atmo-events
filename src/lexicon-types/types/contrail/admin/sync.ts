import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.query("contrail.admin.sync", {
  params: /*#__PURE__*/ v.object({
    /**
     * @minimum 1
     * @maximum 50
     * @default 10
     */
    concurrency: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
        /*#__PURE__*/ v.integerRange(1, 50),
      ]),
      10,
    ),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      backfilled: /*#__PURE__*/ v.integer(),
      discovered: /*#__PURE__*/ v.integer(),
      done: /*#__PURE__*/ v.boolean(),
      remaining: /*#__PURE__*/ v.integer(),
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
    "contrail.admin.sync": mainSchema;
  }
}
