import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.query(
  "community.lexicon.calendar.rsvp.getStats",
  {
    params: null,
    output: {
      type: "lex",
      schema: /*#__PURE__*/ v.object({
        collection: /*#__PURE__*/ v.string(),
        last_record_time_us: /*#__PURE__*/ v.optional(
          /*#__PURE__*/ v.integer(),
        ),
        total_records: /*#__PURE__*/ v.integer(),
        unique_users: /*#__PURE__*/ v.integer(),
      }),
    },
  },
);

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface $params {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "community.lexicon.calendar.rsvp.getStats": mainSchema;
  }
}
