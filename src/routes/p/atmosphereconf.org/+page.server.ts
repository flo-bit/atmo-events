import {
	flattenEventRecords,
	getProfileFromContrail,
	listEventRecordsFromContrail,
	contrail
} from '$lib/contrail';

export async function load({ locals }) {
	const actor = 'atmosphereconf.org';

	const [profile, response, rsvpResponse] = await Promise.all([
		getProfileFromContrail(actor),
		listEventRecordsFromContrail({
			actor,
			profiles: true,
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

	// Build a set of event URIs the user has RSVP'd to (going or interested)
	const rsvpEventUris = new Set<string>();
	if (rsvpResponse?.ok) {
		for (const r of rsvpResponse.data.records ?? []) {
			const status = r.record?.status;
			if (status?.endsWith('#going') || status?.endsWith('#interested')) {
				const uri = r.record?.subject?.uri;
				if (uri) rsvpEventUris.add(uri);
			}
		}
	}

	return {
		profile,
		events,
		actor,
		rsvpEventUris: [...rsvpEventUris],
		loggedIn: !!locals.did
	};
}
