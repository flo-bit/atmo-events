import * as v from 'valibot';
import type { Client } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { getServerClient } from './index';
import {
	flattenEventRecords,
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
import { SEARCH_PAGE_SIZE } from '$lib/search/constants';
import { orQueryFromSlug } from '$lib/topics';
import { hasEnded } from '$lib/past-events';
import { decodeCursor, nextCursor, type CursorArgs, type CursorEnvelope, type CursorQuery } from './cursor';

const PAGE_SIZE = 20;

// The load-more remote input. The continuation cursor is now a self-describing
// ENVELOPE carrying the server-side query name + public-safe args, so the client
// no longer echoes a query-reconstruction bag of pipeline/filters. Only two
// fields are read: `cursor` (the envelope) and `q` (the search TERM, which stays
// OUT of the envelope and rides ?q=/input — see the search resumers). A legacy
// client may still POST extra query params; `v.object` drops them, so they are
// accepted WITHOUT being trusted.
export const listEventsInput = v.object({
	cursor: v.optional(v.string()),
	/** Free-text search term for the search page; ignored for every other query. */
	q: v.optional(v.string())
});

export type LoadMoreEventsInput = v.InferOutput<typeof listEventsInput>;

export type LoadMoreEventsResult = {
	events: ReturnType<typeof flattenEventRecords>;
	handles: Record<string, string>;
	cursor: string | null;
};

const EMPTY: LoadMoreEventsResult = { events: [], handles: {}, cursor: null };

function now(): string {
	return new Date().toISOString();
}

/**
 * Shape a contrail list response into a load-more result, re-encoding the next
 * page's cursor as a same-query envelope (identical `q`/`args`, the fresh raw
 * keyset) so continuations stay on the same server-authoritative query.
 */
function toResult(
	q: CursorQuery,
	args: CursorArgs | undefined,
	response: Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>
): LoadMoreEventsResult {
	if (!response) return EMPTY;
	const events = flattenEventRecords(response.records ?? []);
	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}
	return { events, handles, cursor: nextCursor(q, response.cursor ?? null, args) };
}

/**
 * A resumer re-runs the page-1 query named by the envelope, from the envelope's
 * opaque `raw` keyset, with SERVER-AUTHORITATIVE filter values. It receives the
 * decoded envelope (never the raw client bag) plus the free-text search term
 * (search queries only). Missing/malformed required args => end cleanly (EMPTY);
 * never throw, never fall through to another query.
 */
type Resumer = (
	env: App.Platform['env'],
	client: Client,
	envelope: CursorEnvelope,
	searchTerm: string | undefined
) => Promise<LoadMoreEventsResult>;

// The backend->resumer REGISTRY, keyed by the envelope's query name. Adding a
// paginated query is REGISTERING an entry here, not editing a conditional; every
// filter VALUE is server-authoritative and lives in the entry. The plain,
// unlisted-inclusive listRecords pipeline deliberately has NO entry, so no
// decoded envelope can reach it. (See README → "Load-more pagination".)
const REGISTRY: Record<CursorQuery, Resumer> = {
	events: async (_env, client, { args, raw }) => {
		const response = await listDiscoverableEventsFromContrail(client, {
			startsAtMin: now(),
			profiles: true,
			sort: 'startsAt',
			order: 'asc',
			limit: PAGE_SIZE,
			...(args?.popular ? { rsvpsCountMin: 2 } : {}),
			cursor: raw
		});
		return toResult('events', args, response);
	},

	hosting: async (_env, client, { args, raw }) => {
		if (!args?.actor || !isActorIdentifier(args.actor)) return EMPTY;
		const response = await listAuthoredEventsFromContrail(client, {
			actor: args.actor as ActorIdentifier,
			startsAtMin: now(),
			sort: 'startsAt',
			order: 'asc',
			profiles: true,
			limit: PAGE_SIZE,
			cursor: raw
		});
		return toResult('hosting', args, response);
	},

	'past-events': async (_env, client, { args, raw }) => {
		if (!args?.actor || !isActorIdentifier(args.actor)) return EMPTY;
		const asOf = now();
		const response = await listAuthoredEventsFromContrail(client, {
			actor: args.actor as ActorIdentifier,
			startsAtMax: asOf,
			sort: 'startsAt',
			order: 'desc',
			profiles: true,
			limit: PAGE_SIZE,
			cursor: raw
		});
		// Page 1 narrows the same way, with the same shared predicate: startsAtMax
		// still admits an event that began earlier and is still running, and an
		// ongoing event must not be hidden on page 1 only to resurface on page 2.
		const result = toResult('past-events', args, response);
		return { ...result, events: result.events.filter((e) => hasEnded(e, asOf)) };
	},

	topic: async (_env, client, { args, raw }) => {
		// Re-derive the search from the slug SERVER-side (shared helper), never from
		// a client-supplied query. Unknown slug => end cleanly.
		const search = args?.slug ? orQueryFromSlug(args.slug) : null;
		if (!search) return EMPTY;
		const response = await listDiscoverableEventsFromContrail(client, {
			search,
			startsAtMin: now(),
			sort: 'startsAt',
			order: 'asc',
			profiles: true,
			limit: PAGE_SIZE,
			cursor: raw
		});
		return toResult('topic', args, response);
	},

	'search-d1': async (_env, client, { args, raw }, searchTerm) => {
		const term = searchTerm?.trim();
		if (!term) return EMPTY; // search term lost from the continuation => end cleanly
		const response = await listDiscoverableEventsFromContrail(client, {
			search: term,
			startsAtMin: now(),
			sort: 'startsAt',
			order: 'desc',
			profiles: true,
			limit: SEARCH_PAGE_SIZE,
			cursor: raw
		});
		return toResult('search-d1', args, response);
	},

	'search-meili': async (env, client, { args, raw }, searchTerm) => {
		const term = searchTerm?.trim();
		const backend = term ? searchBackendFromEnv(env) : null;
		// Missing search term OR unconfigured backend => end cleanly rather than
		// restart page 1 on the wrong backend.
		if (!term || !backend) return EMPTY;
		const page = await runEventSearchPage(backend, client, { q: term, cursor: raw });
		return {
			events: page.events,
			handles: page.handles,
			cursor: nextCursor('search-meili', page.cursor, args)
		};
	}
};

/**
 * Shared load-more handler. Kept out of the `.remote.ts` adapter so it is a
 * plain function the SvelteKit remote-functions plugin won't wrap — that lets it
 * be unit-tested directly (the plugin rejects non-remote exports from
 * `*.remote.ts`, so a test there can't mock `$app/server`).
 *
 * Decode the envelope, look up its resumer, resume with server-authoritative
 * filters, re-encode the next envelope — no per-backend if/else. An undecodable
 * or legacy cursor decodes to null and ends pagination cleanly, without
 * reconstructing the query from client fields. See README →
 * "Load-more pagination".
 */
export async function runLoadMoreEvents(
	env: App.Platform['env'],
	input: LoadMoreEventsInput
): Promise<LoadMoreEventsResult> {
	// Two different `q`s meet in this file: `input.q` is the free-text search TERM
	// the client re-supplies, while `envelope.q` below is the server-side query
	// NAME. Bind the term to a distinct local so the rest of the file can't read
	// one as the other. The WIRE field stays `q` — renaming it would silently
	// strand already-loaded search tabs across a deploy.
	const searchTerm = input.q;

	const envelope = decodeCursor(input.cursor);
	if (!envelope) return EMPTY;

	// Own-property dispatch guard: index REGISTRY only when it OWNS the key, so a
	// prototype-chain name (e.g. 'constructor', 'toString') can never resolve to an
	// inherited value and dispatch. decodeCursor already allow-lists `q` against
	// CURSOR_QUERIES upstream, so this is defense in depth against the dispatch
	// ever falling through to a default/plain pipeline.
	if (!Object.hasOwn(REGISTRY, envelope.q)) return EMPTY;
	const resumer = REGISTRY[envelope.q];

	const client = getServerClient(env.DB);
	return resumer(env, client, envelope, searchTerm);
}
