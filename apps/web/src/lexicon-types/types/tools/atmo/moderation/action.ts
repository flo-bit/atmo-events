import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.tidString(),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("tools.atmo.moderation.action"),
			/**
			 * @maxLength 128
			 */
			"action": /*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[/*#__PURE__*/ v.stringLength(0, 128)]
			),
			"createdAt": /*#__PURE__*/ v.datetimeString(),
			"expiresAt": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
			/**
			 * @minLength 1
			 * @maxLength 128
			 */
			"labels": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.array(/*#__PURE__*/ v.constrain(
					/*#__PURE__*/ v.string(),
					[/*#__PURE__*/ v.stringLength(1, 128)]
				)),
				[/*#__PURE__*/ v.arrayLength(1, 128)]
			)),
			"src": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.didString()),
			/**
			 * @maxLength 8192
			 */
			"subject": /*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.string(),
				[/*#__PURE__*/ v.stringLength(0, 8192)]
			),
			"subjectCid": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
		}
	)
);
type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}
export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"tools.atmo.moderation.action": mainSchema;
	}
}
