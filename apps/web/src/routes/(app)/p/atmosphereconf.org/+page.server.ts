import { env } from 'cloudflare:workers';
import { getBlueskyProfile } from '#lib/server/bluesky-profile.js';
import { getProfileCounts } from '#lib/server/profile-counts.js';
import {
	flattenEventRecords,
	getProfileFromContrail,
	listEventRecordsFromContrail
} from '#lib/contrail.js';
import { getServerClient } from '#lib/contrail/index.js';
import { vodFromAtUri, type VodRecord } from '#lib/vods.js';

export async function load({ locals, fetch }) {
	const client = getServerClient(env.DB);
	const actor = 'atmosphereconf.org';

	const [profile, response, rsvpResponse] = await Promise.all([
		getProfileFromContrail(client, actor),
		listEventRecordsFromContrail(client, {
			actor,
			sort: 'startsAt',
			order: 'asc',
			limit: 200
		}),
		locals.did
			? client.get('rsvp.atmo.rsvp.listRecords', {
					params: { actor: locals.did, limit: 200 }
				})
			: null
	]);

	const events = response ? flattenEventRecords(response.records) : [];

	// Build maps of event URI → rsvp status and rkey
	const rsvpStatuses: Record<string, string> = {};
	const rsvpRkeys: Record<string, string> = {};
	if (rsvpResponse?.ok) {
		for (const r of rsvpResponse.data.records ?? []) {
			const status = r.value?.status;
			const uri = r.value?.subject?.uri;
			if (status && uri) {
				const shortStatus = status.split('#').pop()!;
				rsvpStatuses[uri] = shortStatus;
				if (r.rkey) rsvpRkeys[uri] = r.rkey;
			}
		}
	}

	// Build event URI → VOD map from additionalData.vodAtUri
	const eventVods: Record<string, VodRecord> = {};
	for (const event of events) {
		const vodAtUri = (event.additionalData as Record<string, unknown> | undefined)?.vodAtUri as
			string | undefined;
		if (vodAtUri) eventVods[event.uri] = vodFromAtUri(vodAtUri);
	}

	const [blueskyProfile, eventCounts] = profile
		? await Promise.all([
				getBlueskyProfile(profile.did, fetch),
				getProfileCounts(env.DB, profile.did)
			])
		: [undefined, undefined];

	return {
		pageTitle: profile?.value?.displayName || profile?.handle || 'ATmosphereConf',
		hostProfile: profile,
		blueskyProfile,
		eventCounts,
		events,
		actor,
		rsvpStatuses,
		rsvpRkeys,
		loggedIn: !!locals.did,
		eventVods
	};
}
