import { error } from '@sveltejs/kit';
import { command, query, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { getSpacesClient } from '$lib/spaces/server/client';
import { spacesAvailable, SPACE_TYPE } from '$lib/spaces/config';
import type { PublishTarget } from '@atmo-dev/events-ui';
import '../../../lexicon-types/index.js';

const didSchema = v.pipe(v.string(), v.regex(/^did:[a-z]+:.+/));

function getClient() {
	const { locals, platform } = getRequestEvent();
	if (!spacesAvailable()) error(503, 'Community features require spaces to be configured');
	if (!locals.client || !locals.did) error(401, 'Not authenticated');
	if (!platform?.env.DB) error(500, 'No database binding');
	return { client: getSpacesClient(locals.client, platform.env.DB), did: locals.did };
}

function buildPublishersUri(communityDid: string): string {
	return `ats://${communityDid}/${SPACE_TYPE}/$publishers`;
}

export const listPublishTargets = query(async (): Promise<PublishTarget[]> => {
	const { client, did } = getClient();

	const listRes = await client.get('rsvp.atmo.community.list' as any, {
		params: { actor: did }
	});
	if (!listRes.ok) return [];

	const communities = (listRes.data as any).communities as Array<{
		did: string;
		mode: string;
		identifier: string;
		createdAt: string;
	}>;
	if (!communities || communities.length === 0) return [];

	const targets: PublishTarget[] = [];
	for (const comm of communities) {
		const whoamiRes = await client.get('rsvp.atmo.spaceExt.whoami' as any, {
			params: { spaceUri: buildPublishersUri(comm.did) }
		});
		if (whoamiRes.ok && (whoamiRes.data as any).isMember) {
			targets.push({
				did: comm.did,
				identifier: comm.identifier,
				mode: comm.mode
			});
		}
	}

	return targets;
});

export const putCommunityRecord = command(
	v.object({
		communityDid: didSchema,
		collection: v.pipe(v.string(), v.regex(/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/)),
		rkey: v.string(),
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		const { client } = getClient();

		const res = await client.post('rsvp.atmo.community.putRecord' as any, {
			input: {
				communityDid: input.communityDid,
				collection: input.collection,
				rkey: input.rkey,
				record: input.record
			}
		});

		if (!res.ok) {
			const data = res.data as any;
			console.error('[putCommunityRecord] failed', res.status, data);
			if (res.status === 403) {
				error(403, data?.reason ?? 'Not authorized to publish to this community');
			}
			error(502, `Community putRecord failed: ${res.status}`);
		}

		const out = res.data as { uri?: string; cid?: string };
		return { uri: out.uri ?? '', cid: out.cid ?? '' };
	}
);
