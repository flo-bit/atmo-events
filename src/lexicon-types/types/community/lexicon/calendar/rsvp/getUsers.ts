import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.query(
  "community.lexicon.calendar.rsvp.getUsers",
  {
    params: /*#__PURE__*/ v.object({
      cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
      /**
       * @minimum 1
       * @maximum 100
       * @default 50
       */
      limit: /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
          /*#__PURE__*/ v.integerRange(1, 100),
        ]),
        50,
      ),
    }),
    output: {
      type: "lex",
      schema: /*#__PURE__*/ v.object({
        cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
        get users() {
          return /*#__PURE__*/ v.array(userRecordSchema);
        },
      }),
    },
  },
);
const _userRecordSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal(
      "community.lexicon.calendar.rsvp.getUsers#userRecord",
    ),
  ),
  did: /*#__PURE__*/ v.didString(),
  record_count: /*#__PURE__*/ v.integer(),
});

type main$schematype = typeof _mainSchema;
type userRecord$schematype = typeof _userRecordSchema;

export interface mainSchema extends main$schematype {}
export interface userRecordSchema extends userRecord$schematype {}

export const mainSchema = _mainSchema as mainSchema;
export const userRecordSchema = _userRecordSchema as userRecordSchema;

export interface UserRecord extends v.InferInput<typeof userRecordSchema> {}

export interface $params extends v.InferInput<mainSchema["params"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "community.lexicon.calendar.rsvp.getUsers": mainSchema;
  }
}
