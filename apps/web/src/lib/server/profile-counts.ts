import { visibleRecordSql, type Database } from '@atmo-dev/contrail';

export type ProfileCounts = { created: number; rsvpd: number };

/** All-time, visible events, independent of preview pagination. RSVPs count distinct
 * events marked going/interested, not declined or deleted/hidden events. Created
 * events exclude conference talks, matching the profile's authored-event lists. */
export async function getProfileCounts(
	db: Database,
	did: string
): Promise<ProfileCounts | undefined> {
	try {
		return (
			(await db
				.prepare(
					`SELECT
			(SELECT COUNT(*) FROM records_event e
			 WHERE e.did = ? AND ${visibleRecordSql('e')}
			 AND json_extract(e.record, '$.additionalData.parentEvent.uri') IS NULL) AS created,
			(SELECT COUNT(DISTINCT e.uri) FROM records_rsvp r
			 JOIN records_event e ON e.uri = json_extract(r.record, '$.subject.uri')
			 WHERE r.did = ? AND ${visibleRecordSql('r')} AND ${visibleRecordSql('e')}
			 AND json_extract(r.record, '$.status') IN (
				'community.lexicon.calendar.rsvp#going', 'community.lexicon.calendar.rsvp#interested'
			 )) AS rsvpd`
				)
				.bind(did, did)
				.first<ProfileCounts>()) ?? undefined
		);
	} catch {
		// Omit unavailable totals rather than showing misleading zeroes.
		return undefined;
	}
}
