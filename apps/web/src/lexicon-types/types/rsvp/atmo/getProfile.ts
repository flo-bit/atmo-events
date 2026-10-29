import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';
import * as AppBskyActorProfile from "@atcute/bluesky/types/app/actor/profile";
import * as ComAtprotoLabelDefs from "../../com/atproto/label/defs.js";

const _mainSchema = /*#__PURE__*/ v.query(
	"rsvp.atmo.getProfile",
	{
		"params": /*#__PURE__*/ v.object({
			"actor": /*#__PURE__*/ v.actorIdentifierString(),
		}),
		"output": {
			"type": "lex",
			"schema": /*#__PURE__*/ v.object(
				{
					get "profiles"() {
						return /*#__PURE__*/ v.array(profileEntrySchema)
					},
				}
			),
		}
	}
);
const _profileEntrySchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getProfile#profileEntry")),
		"cid": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
		"collection": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.nsidString()),
		"did": /*#__PURE__*/ v.didString(),
		"handle": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
		"rkey": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
		/**
		 * Author declarations on this record version, not trusted labeler claims
		 * @maxLength 10
		 */
		get "selfLabels"() {
			return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
				/*#__PURE__*/ v.array(ComAtprotoLabelDefs.selfLabelSchema),
				[/*#__PURE__*/ v.arrayLength(0, 10)]
			))
		},
		"uri": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.resourceUriString()),
		get "value"() {
			return /*#__PURE__*/ v.optional(AppBskyActorProfile.mainSchema)
		},
	}
);
type main$schematype = typeof _mainSchema;
type profileEntry$schematype = typeof _profileEntrySchema;

export interface mainSchema extends main$schematype {}

export interface profileEntrySchema extends profileEntry$schematype {}
export const mainSchema = _mainSchema as mainSchema;
export const profileEntrySchema = _profileEntrySchema as profileEntrySchema;

export interface ProfileEntry extends v.InferInput<typeof profileEntrySchema> {}

export interface $params extends v.InferInput<mainSchema['params']> {}

export interface $output extends v.InferXRPCBodyInput<mainSchema['output']> {}
declare module '@atcute/lexicons/ambient' {
	interface XRPCQueries {
		"rsvp.atmo.getProfile": mainSchema;
	}
}
