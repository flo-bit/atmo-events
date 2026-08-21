import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';

const _mainSchema = /*#__PURE__*/ v.procedure(
	"rsvp.atmo.notifyOfUpdate",
	{
		"params": null,
		"input": {
			"type": "lex",
			"schema": /*#__PURE__*/ v.object(
				{
					"uri": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.resourceUriString()),
					/**
					 * @maxLength 25
					 */
					"uris": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
						/*#__PURE__*/ v.array(/*#__PURE__*/ v.resourceUriString()),
						[/*#__PURE__*/ v.arrayLength(0, 25)]
					)),
				}
			),
		},
		"output": {
			"type": "lex",
			"schema": /*#__PURE__*/ v.object(
				{
					/**
					 * @minimum 0
					 */
					"deleted": /*#__PURE__*/ v.integer(),
					"errors": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(/*#__PURE__*/ v.string())),
					/**
					 * @minimum 0
					 */
					"indexed": /*#__PURE__*/ v.integer(),
				}
			),
		}
	}
);
type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}
export const mainSchema = _mainSchema as mainSchema;

export interface $params {}

export interface $input extends v.InferXRPCBodyInput<mainSchema['input']> {}

export interface $output extends v.InferXRPCBodyInput<mainSchema['output']> {}
declare module '@atcute/lexicons/ambient' {
	interface XRPCProcedures {
		"rsvp.atmo.notifyOfUpdate": mainSchema;
	}
}
