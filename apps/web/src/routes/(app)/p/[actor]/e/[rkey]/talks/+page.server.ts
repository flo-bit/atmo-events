import { error } from '@sveltejs/kit';
import type { Did } from '@atcute/lexicons';
import { actorToDid } from '$lib/atproto/methods';
import {
	flattenEventRecord,
	flattenEventRecords,
	getEventRecordFromContrail,
	getServerClient,
	listConferenceTalksFromContrail
} from '$lib/contrail';
import { isConferenceEvent } from '@atmo-dev/events-ui/conference';

export async function load({ params, locals, platform }) {
	const client = getServerClient(platform!.env.DB);
	const { rkey } = params;

	let did: Did;
	try {
		did = await actorToDid(params.actor);
	} catch {
		throw error(503, 'Could not resolve this profile right now — please try again.');
	}

	// Managing talks writes to the event owner's repo, so gate to the owner.
	if (!locals.did) throw error(401, 'Sign in to manage talks.');
	if (locals.did !== did) throw error(403, 'You can only manage talks for your own events.');

	const rec = await getEventRecordFromContrail(client, { did, rkey }).catch(() => null);
	const eventData = rec ? flattenEventRecord(rec) : null;
	if (!eventData) throw error(404, 'Event not found');

	const uri = `at://${did}/community.lexicon.calendar.event/${rkey}`;
	const isConference = isConferenceEvent(eventData);

	const talksResp = isConference
		? await listConferenceTalksFromContrail(client, { parentUri: uri, actor: did }).catch(() => null)
		: null;
	const talks = (talksResp ? flattenEventRecords(talksResp.records) : []).map((t) => {
		const ad = (t.additionalData ?? {}) as Record<string, unknown>;
		return {
			uri: t.uri,
			rkey: t.rkey,
			name: t.name,
			startsAt: t.startsAt,
			endsAt: t.endsAt,
			type: (ad.type as string) ?? 'talk',
			room: ad.room as string | undefined
		};
	});

	return {
		actor: params.actor,
		did,
		rkey,
		uri,
		eventName: eventData.name,
		timezone: eventData.timezone ?? null,
		isConference,
		conferenceRooms: ((eventData.additionalData as Record<string, unknown> | undefined)?.rooms ??
			null) as string[] | null,
		talks
	};
}
