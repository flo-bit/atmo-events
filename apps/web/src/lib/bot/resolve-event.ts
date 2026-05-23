import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import type { Handle, ResourceUri } from '@atcute/lexicons/syntax';
import { getEventRecordFromContrail } from '$lib/contrail';
import { getPDS } from '$lib/atproto/methods';
import { ATMO_HOSTS, EVENT_COLLECTION } from './config';

/** The fields of a Bluesky post record we care about for link extraction. */
export type BotPostRecord = {
	text?: string;
	facets?: Array<{ features?: Array<{ $type?: string; uri?: string }> }>;
	embed?: {
		$type?: string;
		external?: { uri?: string };
		media?: { $type?: string; external?: { uri?: string } };
	};
	reply?: {
		root?: { uri: string; cid: string };
		parent?: { uri: string; cid: string };
	};
};

export type AtmoEventLink = { actor: string; rkey: string };

/** Parse `https://atmo.rsvp/p/{actor}/e/{rkey}` into its parts (public events only). */
export function parseAtmoEventUrl(raw: string): AtmoEventLink | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (!ATMO_HOSTS.includes(url.hostname.toLowerCase())) return null;
	// Public event path only. Space URLs (`/p/.../e/.../s/...`) won't match the
	// `$` anchor, so private-space RSVP is intentionally out of scope for v1.
	const m = url.pathname.match(/^\/p\/([^/]+)\/e\/([^/]+)\/?$/);
	if (!m) return null;
	return { actor: decodeURIComponent(m[1]), rkey: m[2] };
}

const URL_RE = /https?:\/\/[^\s)\]]+/g;

/** Pull the first atmo.rsvp event link out of a single post record. */
function linkFromRecord(record: BotPostRecord | undefined): AtmoEventLink | null {
	if (!record) return null;

	const candidates: string[] = [];

	for (const facet of record.facets ?? []) {
		for (const feature of facet.features ?? []) {
			if (feature.$type?.endsWith('richtext.facet#link') && feature.uri) {
				candidates.push(feature.uri);
			}
		}
	}

	const embed = record.embed;
	if (embed?.$type === 'app.bsky.embed.external' && embed.external?.uri) {
		candidates.push(embed.external.uri);
	}
	if (embed?.$type === 'app.bsky.embed.recordWithMedia' && embed.media?.external?.uri) {
		candidates.push(embed.media.external.uri);
	}

	if (record.text) {
		for (const m of record.text.matchAll(URL_RE)) candidates.push(m[0]);
	}

	for (const candidate of candidates) {
		const parsed = parseAtmoEventUrl(candidate);
		if (parsed) return parsed;
	}
	return null;
}

/** Fetch raw post records for the given AT-URIs (best-effort). */
async function fetchPostRecords(
	client: Client,
	uris: string[]
): Promise<Map<string, BotPostRecord>> {
	const out = new Map<string, BotPostRecord>();
	if (uris.length === 0) return out;
	const res = await client.get('app.bsky.feed.getPosts', {
		params: { uris: uris as ResourceUri[] }
	});
	if (!res.ok) return out;
	for (const post of res.data.posts ?? []) {
		out.set(post.uri, post.record as BotPostRecord);
	}
	return out;
}

/**
 * Lenient lookup: the mention reply itself, then its parent, then the thread
 * root. First atmo.rsvp event link wins.
 */
export async function findEventLink(
	client: Client,
	mention: BotPostRecord
): Promise<AtmoEventLink | null> {
	const direct = linkFromRecord(mention);
	if (direct) return direct;

	const parentUri = mention.reply?.parent?.uri;
	const rootUri = mention.reply?.root?.uri;
	const uris = [...new Set([parentUri, rootUri].filter((u): u is string => !!u))];
	if (uris.length === 0) return null;

	const records = await fetchPostRecords(client, uris);
	// Prefer the parent over the root when both contain a link.
	for (const uri of uris) {
		const link = linkFromRecord(records.get(uri));
		if (link) return link;
	}
	return null;
}

/** Resolve an actor (handle or DID) from an atmo.rsvp link to a DID. */
export async function resolveActorDid(client: Client, actor: string): Promise<Did | null> {
	if (actor.startsWith('did:')) return actor as Did;
	const res = await client.get('com.atproto.identity.resolveHandle', {
		params: { handle: actor as Handle }
	});
	if (!res.ok) return null;
	return res.data.did;
}

export type ResolvedEvent = {
	uri: string;
	cid: string;
	/** True when RSVPs are handled off-platform (imported event, `external_only`). */
	externalOnly: boolean;
	/** The off-platform RSVP URL, when known. */
	externalRsvpUrl: string | null;
};

type EventValue = {
	additionalData?: { externalSource?: { rsvpMode?: string; url?: string } };
};

function toResolvedEvent(uri: string, cid: string, value: EventValue | undefined): ResolvedEvent {
	const externalSource = value?.additionalData?.externalSource;
	const externalOnly = externalSource?.rsvpMode === 'external_only';
	return {
		uri,
		cid,
		externalOnly,
		externalRsvpUrl: externalOnly ? (externalSource?.url ?? null) : null
	};
}

/**
 * Load the event referenced by a link. Prefers contrail's in-process index
 * (fast, no network); falls back to a direct read from the owner's PDS when the
 * index misses — so the bot keeps working even while contrail is fresh/behind
 * (e.g. right after a DB switch, before backfill completes). Returns null only
 * when the event genuinely can't be found anywhere.
 */
export async function loadEvent(
	serverClient: Client,
	did: Did,
	rkey: string
): Promise<ResolvedEvent | null> {
	try {
		const event = await getEventRecordFromContrail(serverClient, { did, rkey });
		if (event?.cid) {
			return toResolvedEvent(event.uri, event.cid, event.value as unknown as EventValue);
		}
	} catch {
		// Index hiccup — fall through to the PDS.
	}
	return loadEventFromPds(did, rkey);
}

/** Direct public read of the event record from its owner's PDS (no auth needed). */
async function loadEventFromPds(did: Did, rkey: string): Promise<ResolvedEvent | null> {
	try {
		const pds = await getPDS(did);
		if (!pds) return null;
		const url =
			`${pds.replace(/\/$/, '')}/xrpc/com.atproto.repo.getRecord` +
			`?repo=${encodeURIComponent(did)}&collection=${EVENT_COLLECTION}&rkey=${encodeURIComponent(rkey)}`;
		const res = await fetch(url);
		if (!res.ok) return null;
		const data = (await res.json()) as { uri?: string; cid?: string; value?: EventValue };
		if (!data?.uri || !data?.cid) return null;
		return toResolvedEvent(data.uri, data.cid, data.value);
	} catch {
		return null;
	}
}
