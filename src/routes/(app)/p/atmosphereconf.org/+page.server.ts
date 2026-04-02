import {
	flattenEventRecords,
	getProfileFromContrail,
	getServerClient,
	listEventRecordsFromContrail
} from '$lib/contrail';
import { vodFromAtUri, type VodRecord } from '$lib/vods';

export async function load({ locals, platform }) {
	const client = getServerClient(platform!.env.DB);
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
			? client.get('community.lexicon.calendar.rsvp.listRecords', {
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

	// Build event URI → VOD map from additionalData.vodAtUri
	const eventVods: Record<string, VodRecord> = {};
	for (const event of events) {
		const vodAtUri = (event.additionalData as Record<string, unknown> | undefined)?.vodAtUri as string | undefined;
		if (vodAtUri) eventVods[event.uri] = vodFromAtUri(vodAtUri);
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
