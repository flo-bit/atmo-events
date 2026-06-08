import type { Client } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons';
import { getProfileBlobUrl, getProfileFromContrail } from '$lib/contrail';
import { getActor } from '$lib/actor';
import { SPACE_TYPE } from '$lib/spaces/config';
import type { AuthorityEntry } from './authority-registry';
import { resolveSpaceHostFromDidDoc, type ResolvedAuthority } from './resolve-space-host';
import { mintServiceAuth } from './service-auth';

export type AccessLevel = 'member' | 'manager' | 'admin' | 'owner';

export type PublisherMember = {
	did: string;
	accessLevel: AccessLevel;
	grantedBy?: string;
	grantedAt?: number;
	handle?: string;
	displayName?: string;
	avatar?: string;
};

type OAuthClient = Pick<Client, 'get'>;

type Fetcher = typeof fetch;

type CommunityRequestContext = {
	fetch: Fetcher;
	oauthClient: OAuthClient;
	authority: ResolvedAuthority;
	spaceUri: string;
};

export function publishersSpaceUri(communityDid: string): string {
	return `ats://${communityDid}/${SPACE_TYPE}/$publishers`;
}

export async function detectCommunity(
	actorDid: string,
	registry: AuthorityEntry[]
): Promise<ResolvedAuthority | null> {
	return resolveSpaceHostFromDidDoc(actorDid, registry);
}

async function authorityGet<T>(
	{ fetch, oauthClient, authority }: CommunityRequestContext,
	lxmSuffix: string,
	params: Record<string, string>
): Promise<T> {
	const lxm = `${authority.namespace}.${lxmSuffix}`;
	const token = await mintServiceAuth(oauthClient, authority.serviceDid, lxm);
	const url = new URL(`/xrpc/${lxm}`, authority.endpoint);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	const res = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${lxm} failed: ${res.status} ${body}`);
	}
	return (await res.json()) as T;
}

async function authorityPost<T>(
	{ fetch, oauthClient, authority }: CommunityRequestContext,
	lxmSuffix: string,
	input: Record<string, unknown>
): Promise<T> {
	const lxm = `${authority.namespace}.${lxmSuffix}`;
	const token = await mintServiceAuth(oauthClient, authority.serviceDid, lxm);
	const res = await fetch(`${authority.endpoint}/xrpc/${lxm}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(input)
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${lxm} failed: ${res.status} ${body}`);
	}
	return (await res.json()) as T;
}

export async function getCallerRole(ctx: CommunityRequestContext): Promise<AccessLevel | null> {
	const data = await authorityGet<{ accessLevel?: AccessLevel | null }>(ctx, 'spaceExt.whoami', {
		spaceUri: ctx.spaceUri
	});
	return data.accessLevel ?? null;
}

export async function listPublishers(ctx: CommunityRequestContext): Promise<PublisherMember[]> {
	const data = await authorityGet<{
		rows?: Array<{
			subject?: { did?: string; spaceUri?: string };
			accessLevel?: AccessLevel;
			grantedBy?: string;
			grantedAt?: number;
		}>;
	}>(ctx, 'community.space.listMembers', { spaceUri: ctx.spaceUri });

	return (data.rows ?? [])
		.filter((row) => row.subject?.did && row.accessLevel)
		.map((row) => ({
			did: row.subject!.did!,
			accessLevel: row.accessLevel!,
			grantedBy: row.grantedBy,
			grantedAt: row.grantedAt
		}));
}

export async function hydratePublisherProfiles(
	client: Client,
	members: PublisherMember[]
): Promise<PublisherMember[]> {
	return Promise.all(
		members.map(async (member) => {
			const profile = await getProfileFromContrail(client, member.did as ActorIdentifier).catch(
				() => null
			);
			return {
				...member,
				handle: profile?.handle,
				displayName: profile?.value?.displayName,
				avatar: profile?.value?.avatar
					? getProfileBlobUrl(member.did, profile.value.avatar)
					: undefined
			};
		})
	);
}

export async function grantPublisher(
	ctx: CommunityRequestContext,
	handleOrDid: string
): Promise<void> {
	const did = await getActor(handleOrDid.trim());
	if (!did) throw new Error('User not found');
	await authorityPost(ctx, 'community.space.grant', {
		spaceUri: ctx.spaceUri,
		subject: { did },
		accessLevel: 'member'
	});
}

export async function revokePublisher(
	ctx: CommunityRequestContext,
	memberDid: string
): Promise<void> {
	await authorityPost(ctx, 'community.space.revoke', {
		spaceUri: ctx.spaceUri,
		subject: { did: memberDid }
	});
}

export function canManagePublishers(role: AccessLevel | null): boolean {
	return role === 'owner' || role === 'admin';
}
