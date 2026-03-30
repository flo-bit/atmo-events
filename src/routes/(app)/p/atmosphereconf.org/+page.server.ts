import {
	flattenEventRecords,
	getProfileFromContrail,
	listEventRecordsFromContrail,
	contrail
} from '$lib/contrail';
import { fetchVods, type VodRecord } from '$lib/vods';

export async function load({ locals }) {
	const actor = 'atmosphereconf.org';

	const [profile, response, rsvpResponse, vods] = await Promise.all([
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
			: null,
		fetchVods().catch(() => [] as VodRecord[])
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

	// Build map of event name → VOD for quick lookup in the schedule
	const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	const vodsByName: Record<string, VodRecord> = {};
	for (const vod of vods) {
		vodsByName[normalize(vod.title)] = vod;
	}
	const eventVods: Record<string, VodRecord> = {};
	for (const event of events) {
		const match = vodsByName[normalize(event.name)];
		if (match) eventVods[event.uri] = match;
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
