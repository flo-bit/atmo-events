import {
	flattenEventRecords,
	getProfileFromContrail,
	listEventRecordsFromContrail,
	contrail
} from '$lib/contrail';
import { getAllEventVods, type VodRecord } from '$lib/vods';

export async function load({ locals }) {
	const actor = 'atmosphereconf.org';

	const [profile, response, rsvpResponse] = await Promise.all([
		getProfileFromContrail(actor),
		listEventRecordsFromContrail({
			actor,
			sort: 'startsAt',
			order: 'asc',
			limit: 200
		}),
		locals.did
			? contrail.get('community.lexicon.calendar.rsvp.listRecords', {
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
			const status = r.record?.status;
			const uri = r.record?.subject?.uri;
			if (status && uri) {
				const shortStatus = status.split('#').pop()!;
				rsvpStatuses[uri] = shortStatus;
				if (r.rkey) rsvpRkeys[uri] = r.rkey;
			}
		}
	}

	// Build event URI → VOD map from static mapping
	const vodsByRkey = getAllEventVods();
	const eventVods: Record<string, VodRecord> = {};
	for (const event of events) {
		const vod = vodsByRkey.get(event.rkey);
		if (vod) eventVods[event.uri] = vod;
	}

	return {
		hostProfile: profile,
		events,
		actor,
		rsvpStatuses,
		rsvpRkeys,
		loggedIn: !!locals.did,
		eventVods
	};
}
