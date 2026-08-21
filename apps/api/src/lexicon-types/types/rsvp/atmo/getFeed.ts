import type {} from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';
import type {} from '@atcute/lexicons/ambient';
import * as AppBskyActorProfile from "../../app/bsky/actor/profile.js";
import * as CommunityLexiconCalendarEvent from "../../community/lexicon/calendar/event.js";
import * as CommunityLexiconCalendarRsvp from "../../community/lexicon/calendar/rsvp.js";

const _feedRecordEventSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getFeed#feedRecordEvent")),
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
const _feedRecordRsvpSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getFeed#feedRecordRsvp")),
		"cid": /*#__PURE__*/ v.cidString(),
		"collection": /*#__PURE__*/ v.nsidString(),
		"did": /*#__PURE__*/ v.didString(),
		get "event"() {
			return /*#__PURE__*/ v.optional(refEventRecordSchema)
		},
		"rkey": /*#__PURE__*/ v.string(),
		"time_us": /*#__PURE__*/ v.integer(),
		"uri": /*#__PURE__*/ v.resourceUriString(),
		get "value"() {
			return CommunityLexiconCalendarRsvp.mainSchema
		},
	}
);
const _hydrateRsvpsSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getFeed#hydrateRsvps")),
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
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getFeed#hydrateRsvpsRecord")),
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
	"rsvp.atmo.getFeed",
	{
		"params": /*#__PURE__*/ v.object(
			{
				/**
				 * DID or handle whose feed should be queried
				 */
				"actor": /*#__PURE__*/ v.actorIdentifierString(),
				"collection": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string<"community.lexicon.calendar.event" | "community.lexicon.calendar.rsvp" | (string & {})>()),
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
				"feed": /*#__PURE__*/ v.string<"network" | (string & {})>(),
				/**
				 * Embed the referenced event record
				 */
				"hydrateEvent": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.boolean()),
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
				"sort": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string<"createdAt" | "description" | "endsAt" | "mode" | "name" | "preferencesShowInDiscovery" | "rsvpsCount" | "rsvpsGoingCount" | "rsvpsInterestedCount" | "rsvpsNotgoingCount" | "startsAt" | "status" | "subjectUri" | (string & {})>()),
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
				/**
				 * Filter by subject.uri
				 */
				"subjectUri": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
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
						return /*#__PURE__*/ v.array(/*#__PURE__*/ v.variant([
							feedRecordEventSchema,
							feedRecordRsvpSchema
						]))
					},
				}
			),
		}
	}
);
const _profileEntrySchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getFeed#profileEntry")),
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
const _refEventRecordSchema = /*#__PURE__*/ v.object(
	{
		"$type": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.literal("rsvp.atmo.getFeed#refEventRecord")),
		"cid": /*#__PURE__*/ v.optional(/*#__PURE__*/ v.cidString()),
		"collection": /*#__PURE__*/ v.nsidString(),
		"did": /*#__PURE__*/ v.didString(),
		"rkey": /*#__PURE__*/ v.string(),
		"time_us": /*#__PURE__*/ v.integer(),
		"uri": /*#__PURE__*/ v.resourceUriString(),
		get "value"() {
			return CommunityLexiconCalendarEvent.mainSchema
		},
	}
);
type feedRecordEvent$schematype = typeof _feedRecordEventSchema;
type feedRecordRsvp$schematype = typeof _feedRecordRsvpSchema;
type hydrateRsvps$schematype = typeof _hydrateRsvpsSchema;
type hydrateRsvpsRecord$schematype = typeof _hydrateRsvpsRecordSchema;
type main$schematype = typeof _mainSchema;
type profileEntry$schematype = typeof _profileEntrySchema;
type refEventRecord$schematype = typeof _refEventRecordSchema;

export interface feedRecordEventSchema extends feedRecordEvent$schematype {}

export interface feedRecordRsvpSchema extends feedRecordRsvp$schematype {}

export interface hydrateRsvpsSchema extends hydrateRsvps$schematype {}

export interface hydrateRsvpsRecordSchema extends hydrateRsvpsRecord$schematype {}

export interface mainSchema extends main$schematype {}

export interface profileEntrySchema extends profileEntry$schematype {}

export interface refEventRecordSchema extends refEventRecord$schematype {}
export const feedRecordEventSchema = _feedRecordEventSchema as feedRecordEventSchema;
export const feedRecordRsvpSchema = _feedRecordRsvpSchema as feedRecordRsvpSchema;
export const hydrateRsvpsSchema = _hydrateRsvpsSchema as hydrateRsvpsSchema;
export const hydrateRsvpsRecordSchema = _hydrateRsvpsRecordSchema as hydrateRsvpsRecordSchema;
export const mainSchema = _mainSchema as mainSchema;
export const profileEntrySchema = _profileEntrySchema as profileEntrySchema;
export const refEventRecordSchema = _refEventRecordSchema as refEventRecordSchema;

export interface FeedRecordEvent extends v.InferInput<typeof feedRecordEventSchema> {}

export interface FeedRecordRsvp extends v.InferInput<typeof feedRecordRsvpSchema> {}

export interface HydrateRsvps extends v.InferInput<typeof hydrateRsvpsSchema> {}

export interface HydrateRsvpsRecord extends v.InferInput<typeof hydrateRsvpsRecordSchema> {}

export interface ProfileEntry extends v.InferInput<typeof profileEntrySchema> {}

export interface RefEventRecord extends v.InferInput<typeof refEventRecordSchema> {}

export interface $params extends v.InferInput<mainSchema['params']> {}

export interface $output extends v.InferXRPCBodyInput<mainSchema['output']> {}
declare module '@atcute/lexicons/ambient' {
	interface XRPCQueries {
		"rsvp.atmo.getFeed": mainSchema;
	}
}
