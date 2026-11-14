/**
 * ATmosphereConf 2026 predates `additionalData.parentEvent` and
 * `additionalData.type = 'conference'`. Its talks live in atmosphereconf.org's
 * repo with an `isAtmosphereconf` flag, while the conference event lives in
 * atmosphere.community's repo without a type. These records are not ours to
 * rewrite, so map them onto the generic conference model here and nowhere
 * else. Delete this module if the records are ever migrated.
 */

export const LEGACY_CONFERENCE_URI =
	'at://did:plc:lehcqqkwzcwvjvw66uthu5oq/community.lexicon.calendar.event/3lte3c7x43l2e';
/** atmosphereconf.org — the repo that holds the legacy talks. */
export const LEGACY_TALKS_DID = 'did:plc:3xewinw4wtimo2lqfy5fm5sw';

const LEGACY_FLAG = 'isAtmosphereconf';

type WithAdditionalData = { additionalData?: unknown; timezone?: string };

/** Adds the generic conference fields to legacy records; others pass through. */
export function normalizeLegacyConference<T extends WithAdditionalData>(uri: string, body: T): T {
	const ad = (body.additionalData ?? {}) as Record<string, unknown>;
	if (uri === LEGACY_CONFERENCE_URI && !ad.type) {
		return {
			...body,
			timezone: body.timezone ?? 'America/Vancouver',
			additionalData: { ...ad, type: 'conference' }
		};
	}
	if (ad[LEGACY_FLAG] && !ad.parentEvent) {
		return { ...body, additionalData: { ...ad, parentEvent: { uri: LEGACY_CONFERENCE_URI } } };
	}
	return body;
}

/** Repo that holds a conference's talks (the organizer's own, except legacy). */
export function conferenceTalksActor(conferenceUri: string, organizerDid: string): string {
	return conferenceUri === LEGACY_CONFERENCE_URI ? LEGACY_TALKS_DID : organizerDid;
}

/** SQL predicate: the event belongs to a parent event. */
export function hasParentEventSql(recordCol: string): string {
	return `(json_extract(${recordCol}, '$.additionalData.parentEvent.uri') IS NOT NULL
		OR json_extract(${recordCol}, '$.additionalData.${LEGACY_FLAG}') IS 1)`;
}

/** SQL predicate and params: the event's parent is `parentUri`. */
export function parentEventSql(
	recordCol: string,
	parentUri: string
): { condition: string; params: string[] } {
	const direct = `json_extract(${recordCol}, '$.additionalData.parentEvent.uri') = ?`;
	if (parentUri !== LEGACY_CONFERENCE_URI) return { condition: direct, params: [parentUri] };
	return {
		condition: `(${direct} OR json_extract(${recordCol}, '$.additionalData.${LEGACY_FLAG}') IS 1)`,
		params: [parentUri]
	};
}
