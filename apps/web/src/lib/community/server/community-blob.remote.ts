import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import type { EditorBlobRef } from '@atmo-dev/events-ui';
import { parseAuthorityRegistry } from './authority-registry';
import { resolveSpaceHost } from './resolve-space-host';

const didSchema = v.pipe(v.string(), v.regex(/^did:[a-z]+:.+/));

function getSession() {
	const { locals } = getRequestEvent();
	if (!locals.client || !locals.did) error(401, 'Not authenticated');
	return { oauthClient: locals.client, did: locals.did };
}

async function mintServiceAuth(
	oauthClient: { get: Function },
	aud: string,
	lxm: string
): Promise<string> {
	const res = await oauthClient.get('com.atproto.server.getServiceAuth', {
		params: {
			aud: aud as `did:${string}:${string}`,
			lxm: lxm as `${string}.${string}.${string}`,
			exp: Math.floor(Date.now() / 1000) + 300
		}
	});
	if (!res.ok) {
		throw new Error(`getServiceAuth failed: ${res.status} ${JSON.stringify(res.data)}`);
	}
	return res.data.token;
}

/**
 * Upload a blob into a community's repo via the custodian (contrail-community's
 * `<ns>.community.uploadBlob` proxy). The custodian enforces the `$publishers`
 * ACL and writes the bytes to the community PDS, so the returned BlobRef is
 * valid in the COMMUNITY repo — exactly what a subsequent `putCommunityRecord`
 * needs to reference. The blob bytes are the request body, so `communityDid`
 * rides in the query string.
 */
export const uploadCommunityBlob = command(
	v.object({
		communityDid: didSchema,
		bytes: v.array(v.number()),
		mimeType: v.string()
	}),
	async (input): Promise<EditorBlobRef> => {
		const { oauthClient } = getSession();
		const { fetch, platform } = getRequestEvent();
		const registry = parseAuthorityRegistry(platform?.env?.COMMUNITY_AUTHORITIES);
		const authority = await resolveSpaceHost(input.communityDid, registry);
		const lxm = `${authority.namespace}.community.uploadBlob`;
		const token = await mintServiceAuth(oauthClient, authority.serviceDid, lxm);

		const url = `${authority.endpoint}/xrpc/${lxm}?communityDid=${encodeURIComponent(
			input.communityDid
		)}`;
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': input.mimeType || 'application/octet-stream'
			},
			body: new Uint8Array(input.bytes) as unknown as BodyInit
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			console.error('[uploadCommunityBlob] failed', res.status, data);
			if (res.status === 403) {
				error(403, (data as any)?.reason ?? 'Not authorized to publish to this community');
			}
			error(502, `Community uploadBlob failed: ${res.status}`);
		}

		const out = (await res.json()) as { blob?: EditorBlobRef };
		if (!out.blob) error(502, 'Community uploadBlob returned no blob');
		return out.blob;
	}
);
