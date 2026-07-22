import { error } from '@sveltejs/kit';
import { getActor } from '$lib/actor';
import { atmConfigured, atmOrganizerTicketCreationEnabled, getAtmConfig } from '$lib/atm/config';
import {
	probeOrganizerTicketSync,
	type OrganizerTicketSyncState
} from '$lib/atm/organizer-sync.server';
import { flattenEventRecord, getEventRecordFromContrail, getServerClient } from '$lib/contrail';

export async function load({ params, platform, locals }) {
	const client = getServerClient(platform!.env.DB);
	const { rkey } = params;

	const did = await getActor(params.actor);

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}
	const isOwner = locals.did === did;
	const atmConfiguredForOwner = isOwner && atmConfigured(platform!.env);
	const atmTicketCreationEnabled =
		isOwner && atmOrganizerTicketCreationEnabled(platform!.env, locals.did);
	const atmConfig = atmConfiguredForOwner ? getAtmConfig(platform!.env) : null;

	try {
		const eventRecord = await getEventRecordFromContrail(client, { did, rkey }).catch(() => null);
		const eventData = eventRecord ? flattenEventRecord(eventRecord) : null;
		let atmTicketSyncState: OrganizerTicketSyncState = 'unticketed';
		if (
			atmConfiguredForOwner &&
			eventData &&
			eventData.status !== 'community.lexicon.calendar.event#planned'
		) {
			const eventUri = `at://${did}/community.lexicon.calendar.event/${rkey}`;
			atmTicketSyncState = await probeOrganizerTicketSync(platform!.env, eventUri);
		}

		if (!eventData) {
			return {
				eventData: null,
				actorDid: did,
				rkey,
				atmTicketCreationEnabled,
				atmTicketSyncState,
				atmTicketIconUrl: atmConfig
					? new URL('/atmosphere-tickets.svg', atmConfig.brokerUrl).toString()
					: null
			};
		}

		return {
			eventData,
			actorDid: did,
			rkey,
			atmTicketCreationEnabled,
			atmTicketSyncState,
			atmTicketIconUrl: atmConfig
				? new URL('/atmosphere-tickets.svg', atmConfig.brokerUrl).toString()
				: null
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
