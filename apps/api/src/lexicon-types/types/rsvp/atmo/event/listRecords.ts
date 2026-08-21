import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';
import * as AppBskyActorProfile from "../../../app/bsky/actor/profile.js";
import * as CommunityLexiconCalendarEvent from "../../../community/lexicon/calendar/event.js";
import * as CommunityLexiconCalendarRsvp from "../../../community/lexicon/calendar/rsvp.js";

const _hydrateRsvpsSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.event.listRecords#hydrateRsvps")),
		get "going"() {
			return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(hydrateRsvpsRecordSchema))
		},
		get "interested"() {
			return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(hydrateRsvpsRecordSchema))
		},
		get "notgoing"() {
			return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(hydrateRsvpsRecordSchema))
		},
		get "other"() {
			return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(hydrateRsvpsRecordSchema))
		},
	}
);
const _hydrateRsvpsRecordSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.event.listRecords#hydrateRsvpsRecord")),
		"cid": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
		"collection": /*#__PURE__*/ v.nsidString(),
		"did": /*#__PURE__*/ v.didString(),
		"rkey": /*#__PURE__*/ v.string(),
		"time_us": /*#__PURE__*/ v.integer(),
		"uri": /*#__PURE__*/ v.resourceUriString(),
		get "value"() {
			return CommunityLexiconCalendarRsvp.mainSchema
		},
	}
);
const _mainSchema = /*#__PURE__*/ v.query(
	"rsvp.atmo.event.listRecords",
	{
		"params": /*#__PURE__*/ v.object(
			{
				/**
				 * Filter by an indexed DID or cached handle
				 */
				"actor": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.actorIdentifierString()),
				/**
				 * Maximum value for createdAt
				 */
				"createdAtMax": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Minimum value for createdAt
				 */
				"createdAtMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				"cursor": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Filter by description
				 */
				"description": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Maximum value for endsAt
				 */
				"endsAtMax": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Minimum value for endsAt
				 */
				"endsAtMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Number of rsvps records to embed
				 * @minimum 1
				 * @maximum 50
				 */
				"hydrateRsvps": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.constrain(
					/*#__PURE__*/ v.integer(),
					[/*#__PURE__*/ v.integerRange(1, 50)]
				)),
				/**
				 * @minimum 1
				 * @maximum 200
				 * @default 50
				 */
				"limit": /*#__PURE__*/ v.optional(
					/*#__PURE__*/ v.constrain(
						/*#__PURE__*/ v.integer(),
						[/*#__PURE__*/ v.integerRange(1, 200)]
					),
					50
				),
				/**
				 * Filter by mode
				 */
				"mode": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Filter by name
				 */
				"name": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Sort direction
				 */
				"order": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string<"asc" | "desc" | (string & {})>()),
				/**
				 * Filter by preferences.showInDiscovery
				 */
				"preferencesShowInDiscovery": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Include indexed profile and identity information
				 */
				"profiles": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
				/**
				 * Minimum total rsvps count
				 */
				"rsvpsCountMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
				/**
				 * Minimum rsvps count where status = going
				 */
				"rsvpsGoingCountMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
				/**
				 * Minimum rsvps count where status = interested
				 */
				"rsvpsInterestedCountMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
				/**
				 * Minimum rsvps count where status = notgoing
				 */
				"rsvpsNotgoingCountMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
				/**
				 * Full-text search across: mode, name, status, description
				 */
				"search": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Field to sort by (default: time_us)
				 */
				"sort": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string<"createdAt" | "description" | "endsAt" | "mode" | "name" | "preferencesShowInDiscovery" | "rsvpsCount" | "rsvpsGoingCount" | "rsvpsInterestedCount" | "rsvpsNotgoingCount" | "startsAt" | "status" | (string & {})>()),
				/**
				 * Maximum value for startsAt
				 */
				"startsAtMax": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Minimum value for startsAt
				 */
				"startsAtMin": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
				/**
				 * Filter by status
				 */
				"status": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
			}
		),
		"output": {
			"type": "lex",
			"schema": /*#__PURE__*/ v.object(
				{
					"cursor": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
					get "profiles"() {
						return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(profileEntrySchema))
					},
					get "records"() {
						return /*#__PURE__*/ v.array(recordSchema)
					},
				}
			),
		}
	}
);
const _profileEntrySchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.event.listRecords#profileEntry")),
		"cid": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
		"collection": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.nsidString()),
		"did": /*#__PURE__*/ v.didString(),
		"handle": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
		"rkey": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
		"uri": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.resourceUriString()),
		get "value"() {
			return /*#__PURE__*/ v.optional(AppBskyActorProfile.mainSchema)
		},
	}
);
const _recordSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.event.listRecords#record")),
		"cid": /*#__PURE__*/ v.cidString(),
		"collection": /*#__PURE__*/ v.nsidString(),
		"did": /*#__PURE__*/ v.didString(),
		"rkey": /*#__PURE__*/ v.string(),
		get "rsvps"() {
			return /*#__PURE__*/ v.optional(hydrateRsvpsSchema)
		},
		/**
		 * Total rsvps count
		 */
		"rsvpsCount": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
		/**
		 * rsvps count where status = going
		 */
		"rsvpsGoingCount": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
		/**
		 * rsvps count where status = interested
		 */
		"rsvpsInterestedCount": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
		/**
		 * rsvps count where status = notgoing
		 */
		"rsvpsNotgoingCount": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
		"time_us": /*#__PURE__*/ v.integer(),
		"uri": /*#__PURE__*/ v.resourceUriString(),
		get "value"() {
			return CommunityLexiconCalendarEvent.mainSchema
		},
	}
);
type hydrateRsvps$schematype = typeof _hydrateRsvpsSchema;
type hydrateRsvpsRecord$schematype = typeof _hydrateRsvpsRecordSchema;
type main$schematype = typeof _mainSchema;
type profileEntry$schematype = typeof _profileEntrySchema;
type record$schematype = typeof _recordSchema;

export interface hydrateRsvpsSchema extends hydrateRsvps$schematype {}

export interface hydrateRsvpsRecordSchema extends hydrateRsvpsRecord$schematype {}

export interface mainSchema extends main$schematype {}

export interface profileEntrySchema extends profileEntry$schematype {}

export interface recordSchema extends record$schematype {}
export const hydrateRsvpsSchema = _hydrateRsvpsSchema as hydrateRsvpsSchema;
export const hydrateRsvpsRecordSchema = _hydrateRsvpsRecordSchema as hydrateRsvpsRecordSchema;
export const mainSchema = _mainSchema as mainSchema;
export const profileEntrySchema = _profileEntrySchema as profileEntrySchema;
export const recordSchema = _recordSchema as recordSchema;

export interface HydrateRsvps extends v.InferInput<typeof hydrateRsvpsSchema> {}

export interface HydrateRsvpsRecord extends v.InferInput<typeof hydrateRsvpsRecordSchema> {}

export interface ProfileEntry extends v.InferInput<typeof profileEntrySchema> {}

export interface Record extends v.InferInput<typeof recordSchema> {}

export interface $params extends v.InferInput<mainSchema['params']> {}

export interface $output extends v.InferXRPCBodyInput<mainSchema['output']> {}
declare module '@atcute/lexicons/ambient' {
	interface XRPCQueries {
		"rsvp.atmo.event.listRecords": mainSchema;
	}
}
