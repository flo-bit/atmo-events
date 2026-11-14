import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _mainSchema = /*#__PURE__*/ v.record(
	/*#__PURE__*/ v.literal("self"),
	/*#__PURE__*/ v.object(
		{
			"$type": /*#__PURE__*/ v.literal("rsvp.atmo.actor.privateEventsBeta"),
			/**
			 * true when the actor makes private events in the beta.
			 */
			"privateEvents": /*#__PURE__*/ v.boolean(),
			"updatedAt": /*#__PURE__*/ v.datetimeString(),
		}
	)
);
type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}
export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}
declare module '@atcute/lexicons/ambient' {
	interface Records {
		"rsvp.atmo.actor.privateEventsBeta": mainSchema;
	}
}
