import {
	batchedInQuery,
	normalizeProfileConfig,
	recordsTableName,
	type ContrailConfig,
	type Database
} from '@atmo-dev/contrail';
import { getProfileBlobUrl } from '../contrail';
import { fallbackProfile, subjectDid, type InboxProfile, type InboxReport } from './inbox';

/** Moderator-only local metadata. No remote lookups disclose who was reported.
 * Unlike public profile reads, hidden accounts must remain identifiable here. */
export async function enrichInboxReports(
	db: Database,
	config: ContrailConfig,
	reports: InboxReport[]
): Promise<InboxReport[]> {
	if (!reports.length) return [];
	const dids = [
		...new Set(
			reports
				.flatMap((report) => [report.reportedBy, subjectDid(report)])
				.filter((did): did is string => !!did)
		)
	];
	const profiles = new Map<string, InboxProfile>(dids.map((did) => [did, fallbackProfile(did)]));
	try {
		const identities = await batchedInQuery<{ did: string; handle: string | null }>(
			db,
			'SELECT did, handle FROM identities WHERE did IN (__IN__)',
			[],
			dids
		);
		for (const { did, handle } of identities) {
			if (handle && handle !== 'handle.invalid')
				profiles.set(did, { ...profiles.get(did)!, handle, name: `@${handle}` });
		}
		const profileConfig = config.profiles
			?.map(normalizeProfileConfig)
			.find((entry) => entry.collection === 'app.bsky.actor.profile');
		if (profileConfig) {
			const uris = dids.map(
				(did) => `at://${did}/${profileConfig.collection}/${profileConfig.rkey ?? 'self'}`
			);
			const rows = await batchedInQuery<{ did: string; record: string }>(
				db,
				`SELECT did, record FROM ${recordsTableName(profileConfig.shortName ?? profileConfig.collection)} WHERE uri IN (__IN__)`,
				[],
				uris
			);
			for (const row of rows) {
				let value: { displayName?: unknown; avatar?: unknown };
				try {
					value = JSON.parse(row.record);
				} catch {
					continue;
				}
				if (!value || typeof value !== 'object') continue;
				const profile = profiles.get(row.did);
				if (!profile) continue;
				profiles.set(row.did, {
					...profile,
					name:
						typeof value.displayName === 'string' && value.displayName.trim()
							? value.displayName
							: profile.name,
					avatar: getProfileBlobUrl(row.did, value.avatar)
				});
			}
		}
	} catch (cause) {
		// A missing profile or optional metadata failure must not block review.
		console.error('[moderation] profile metadata unavailable', cause);
	}
	return reports.map((report) => ({
		...report,
		reporter: profiles.get(report.reportedBy) ?? fallbackProfile(report.reportedBy),
		subjectProfile: profiles.get(subjectDid(report) ?? '')
	}));
}
