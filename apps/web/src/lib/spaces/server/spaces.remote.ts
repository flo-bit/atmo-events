import { error } from '@sveltejs/kit';
import { command, query, getRequestEvent } from '$app/server';
import { dev } from '$app/environment';
import * as v from 'valibot';
import '../../../lexicon-types/index.js';
import { getSpacesClient } from './client';
import { SPACE_TYPE, spacesAvailable } from '../config';

const atUriSchema = v.pipe(v.string(), v.regex(/^ats?:\/\/.+/));
const didSchema = v.pipe(v.string(), v.regex(/^did:[a-z]+:.+/));
const nsidSchema = v.pipe(v.string(), v.regex(/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/));

function getClient() {
	const { locals, platform } = getRequestEvent();
	if (!spacesAvailable()) error(503, 'Spaces are not configured in this environment');
	if (!locals.client || !locals.did) error(401, 'Not authenticated');
	if (!platform?.env.DB) error(500, 'No database binding');
	return { client: getSpacesClient(locals.client, platform.env.DB), did: locals.did };
}

// ── Spaces ────────────────────────────────────────────────────────

/** Create a private event: makes a space owned by the caller and writes the event record inside it. */
export const createPrivateEvent = command(
	v.object({
		key: v.optional(v.string()),
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		if (!dev) error(403, 'Private events are not available yet');
		const { client } = getClient();

		const createRes = await client.post('rsvp.atmo.space.createSpace', {
			input: { type: SPACE_TYPE, key: input.key }
		});
		if (!createRes.ok) {
			console.error('createSpace failed', createRes.status, createRes.data);
			error(500, `createSpace failed: ${createRes.status} ${JSON.stringify(createRes.data)}`);
		}
		const spaceUri = createRes.data.space.uri;

		const putRes = await client.post('rsvp.atmo.space.putRecord', {
			input: {
				spaceUri,
				collection: 'community.lexicon.calendar.event',
				record: input.record
			}
		});
		if (!putRes.ok) {
			console.error('putRecord (space) failed', putRes.status, putRes.data);
			error(500, `putRecord failed: ${putRes.status} ${JSON.stringify(putRes.data)}`);
		}

		return { spaceUri, rkey: putRes.data.rkey };
	}
);

export const listMyPrivateSpaces = query(async () => {
	const { client } = getClient();
	const res = await client.get('rsvp.atmo.space.listSpaces', {
		params: { scope: 'owner', type: SPACE_TYPE }
	});
	if (!res.ok) error(500, 'listSpaces failed');
	return res.data.spaces;
});

export const listMySpaceMemberships = query(async () => {
	const { client } = getClient();
	const res = await client.get('rsvp.atmo.space.listSpaces', {
		params: { scope: 'member', type: SPACE_TYPE }
	});
	if (!res.ok) error(500, 'listSpaces failed');
	return res.data.spaces;
});

export const getPrivateSpace = query(v.object({ spaceUri: atUriSchema }), async ({ spaceUri }) => {
	const { client } = getClient();
	const spaceRes = await client.get('rsvp.atmo.space.getSpace', {
		params: { uri: spaceUri as unknown as import('@atcute/lexicons').ResourceUri }
	});
	// Return ok:false instead of throwing — callers (load functions) need to branch on
	// access state, and SvelteKit's error() registers with request-level error tracking
	// even when caught, which would show the default error page.
	if (!spaceRes.ok) return { ok: false as const, status: spaceRes.status };

	const [eventsRes, rsvpsRes] = await Promise.all([
		client.get('rsvp.atmo.space.listRecords', {
			params: {
				spaceUri: spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				collection: 'community.lexicon.calendar.event'
			}
		}),
		client.get('rsvp.atmo.space.listRecords', {
			params: {
				spaceUri: spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				collection: 'community.lexicon.calendar.rsvp'
			}
		})
	]);
	const events = eventsRes.ok ? eventsRes.data.records : [];
	const rsvps = rsvpsRes.ok ? rsvpsRes.data.records : [];

	return { ok: true as const, space: spaceRes.data.space, events, rsvps };
});

// ── Members ───────────────────────────────────────────────────────

export const listMembers = query(v.object({ spaceUri: atUriSchema }), async ({ spaceUri }) => {
	const { client } = getClient();
	const res = await client.get('rsvp.atmo.space.listMembers', {
		params: { spaceUri: spaceUri as unknown as import('@atcute/lexicons').ResourceUri }
	});
	if (!res.ok) error(res.status, 'listMembers failed');
	return res.data.members;
});

export const addMember = command(
	v.object({
		spaceUri: atUriSchema,
		did: didSchema,
		perms: v.optional(v.string())
	}),
	async (input) => {
		const { client } = getClient();
		const res = await client.post('rsvp.atmo.space.addMember', {
			input: {
				spaceUri: input.spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				did: input.did as `did:${string}:${string}`,
				perms: input.perms
			}
		});
		if (!res.ok) error(res.status, 'addMember failed');
		return { ok: true };
	}
);

export const removeMember = command(
	v.object({
		spaceUri: atUriSchema,
		did: didSchema
	}),
	async (input) => {
		const { client } = getClient();
		const res = await client.post('rsvp.atmo.space.removeMember', {
			input: {
				spaceUri: input.spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				did: input.did as `did:${string}:${string}`
			}
		});
		if (!res.ok) error(res.status, 'removeMember failed');
		return { ok: true };
	}
);

// ── Invites ───────────────────────────────────────────────────────

export const createInvite = command(
	v.object({
		spaceUri: atUriSchema,
		kind: v.optional(v.picklist(['join', 'read', 'read-join'])),
		perms: v.optional(v.string()),
		expiresAt: v.optional(v.number()),
		maxUses: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		note: v.optional(v.string())
	}),
	async (input) => {
		const { client } = getClient();
		const res = await client.post('rsvp.atmo.invite.create', {
			input: { ...input, spaceUri: input.spaceUri as unknown as import('@atcute/lexicons').ResourceUri }
		});
		if (!res.ok) error(res.status, 'createInvite failed');
		return res.data;
	}
);

export const listInvites = query(
	v.object({ spaceUri: atUriSchema, includeRevoked: v.optional(v.boolean()) }),
	async ({ spaceUri, includeRevoked }) => {
		const { client } = getClient();
		const res = await client.get('rsvp.atmo.invite.list', {
			params: {
				spaceUri: spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				includeRevoked: includeRevoked ?? false
			}
		});
		if (!res.ok) error(res.status, 'listInvites failed');
		return res.data.invites;
	}
);

export const revokeInvite = command(
	v.object({ spaceUri: atUriSchema, tokenHash: v.string() }),
	async (input) => {
		const { client } = getClient();
		const res = await client.post('rsvp.atmo.invite.revoke', {
			input: { ...input, spaceUri: input.spaceUri as unknown as import('@atcute/lexicons').ResourceUri }
		});
		if (!res.ok) error(res.status, 'revokeInvite failed');
		return res.data;
	}
);

// ── Generic space record ops (for inside-space writes like private RSVPs) ──

export const putSpaceRecord = command(
	v.object({
		spaceUri: atUriSchema,
		collection: nsidSchema,
		rkey: v.optional(v.string()),
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		const { client } = getClient();
		const res = await client.post('rsvp.atmo.space.putRecord', {
			input: {
				spaceUri: input.spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				collection: input.collection as `${string}.${string}.${string}`,
				rkey: input.rkey,
				record: input.record
			}
		});
		if (!res.ok) error(res.status, `putSpaceRecord failed`);
		return res.data;
	}
);

export const deleteSpaceRecord = command(
	v.object({
		spaceUri: atUriSchema,
		collection: nsidSchema,
		rkey: v.string()
	}),
	async (input) => {
		const { client } = getClient();
		const res = await client.post('rsvp.atmo.space.deleteRecord', {
			input: {
				spaceUri: input.spaceUri as unknown as import('@atcute/lexicons').ResourceUri,
				collection: input.collection as `${string}.${string}.${string}`,
				rkey: input.rkey
			}
		});
		if (!res.ok) error(res.status, `deleteSpaceRecord failed`);
		return res.data;
	}
);

export const redeemInvite = command(v.object({ token: v.string() }), async ({ token }) => {
	const { client } = getClient();
	const res = await client.post('rsvp.atmo.invite.redeem', { input: { token } });
	if (!res.ok) {
		console.error('[redeemInvite] xrpc error', res.status, res.data);
		error(res.status, `redeemInvite ${res.status}: ${JSON.stringify(res.data)}`);
	}
	return res.data;
});
