import { error } from '@sveltejs/kit';
import type { EventData } from '$lib/event-types';
import { getRecord } from '$lib/atproto/methods.js';
import { loadProfile } from '$lib/atproto/server/profile';
import type { Did } from '@atcute/lexicons';
import { getActor } from '$lib/actor';

export async function load({ params, platform, request }) {
	const { rkey } = params;

	const did = await getActor({ request, paramActor: params.actor, platform });

	if (!did || !rkey) {
		throw error(404, 'Event not found');
	}

	try {
		const [eventRecord, rawProfile] = await Promise.all([
			getRecord({
				did: did as Did,
				collection: 'community.lexicon.calendar.event',
				rkey
			}).catch(() => null),
			loadProfile(did as Did, platform?.env?.PROFILE_CACHE).catch(() => null)
		]);

		const hostProfile = rawProfile
			? {
					did: (rawProfile as Record<string, unknown>).did as string,
					handle: (rawProfile as Record<string, unknown>).handle as string | undefined,
					displayName: (rawProfile as Record<string, unknown>).displayName as string | undefined,
					avatar: (rawProfile as Record<string, unknown>).avatar as string | undefined
				}
			: null;

		if (!eventRecord?.value) {
			return {
				eventData: null,
				did,
				rkey,
				hostProfile,
				eventCid: null
			};
		}

		const eventData: EventData = eventRecord.value as EventData;

		return {
			eventData,
			did,
			rkey,
			hostProfile,
			eventCid: (eventRecord.cid as string) ?? null
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, 'Event not found');
	}
}
