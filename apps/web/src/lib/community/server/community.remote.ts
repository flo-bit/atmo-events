import { error } from '@sveltejs/kit';
import { command, query, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import type { PublishTarget } from '@atmo-dev/events-ui';
import { parseAuthorityRegistry } from './authority-registry';
import { resolveSpaceHost } from './resolve-space-host';
import { mintServiceAuth } from './service-auth';
import { env as privateEnv } from '$env/dynamic/private';

const didSchema = v.pipe(v.string(), v.regex(/^did:[a-z]+:.+/));

function getSession() {
	const { locals } = getRequestEvent();
	if (!locals.client || !locals.did) error(401, 'Not authenticated');
	return { oauthClient: locals.client, did: locals.did };
}

export const listPublishTargets = query(async (): Promise<PublishTarget[]> => {
	const { oauthClient, did } = getSession();
	const registry = parseAuthorityRegistry(privateEnv.COMMUNITY_AUTHORITIES);
	if (registry.length === 0) return [];

	const { fetch } = getRequestEvent();
	const targets: PublishTarget[] = [];

	for (const authority of registry) {
		try {
			const lxm = `${authority.namespace}.community.list`;
			const token = await mintServiceAuth(oauthClient, authority.serviceDid, lxm);

			const url = `${authority.endpoint}/xrpc/${lxm}?actor=${encodeURIComponent(did)}`;
			const res = await fetch(url, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!res.ok) {
				console.warn(`[listPublishTargets] ${authority.endpoint} returned ${res.status}`);
				continue;
			}

			const data = (await res.json()) as { communities?: Array<{
				did: string;
				mode: string;
				identifier: string;
			}> };
			const communities = data.communities as Array<{
				did: string;
				mode: string;
				identifier: string;
			}>;

			if (communities) {
				for (const comm of communities) {
					targets.push({
						did: comm.did,
						identifier: comm.identifier,
						mode: comm.mode
					});
				}
			}
		} catch (err) {
			console.warn(`[listPublishTargets] authority ${authority.endpoint} unreachable:`, err);
		}
	}

	return targets;
});

export const putCommunityRecord = command(
	v.object({
		communityDid: didSchema,
		collection: v.pipe(
			v.string(),
			v.regex(/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/)
		),
		rkey: v.string(),
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		const { oauthClient } = getSession();
		const registry = parseAuthorityRegistry(privateEnv.COMMUNITY_AUTHORITIES);
		const authority = await resolveSpaceHost(input.communityDid, registry);

		const { fetch } = getRequestEvent();
		const lxm = `${authority.namespace}.community.putRecord`;
		const token = await mintServiceAuth(oauthClient, authority.serviceDid, lxm);

		const res = await fetch(`${authority.endpoint}/xrpc/${lxm}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				communityDid: input.communityDid,
				collection: input.collection,
				rkey: input.rkey,
				record: input.record
			})
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			console.error('[putCommunityRecord] failed', res.status, data);
			if (res.status === 403) {
				error(403, (data as any)?.reason ?? 'Not authorized to publish to this community');
			}
			error(502, `Community putRecord failed: ${res.status}`);
		}

		const out = (await res.json()) as { uri?: string; cid?: string };
		return { uri: out.uri ?? '', cid: out.cid ?? '' };
	}
);
