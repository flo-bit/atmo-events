import * as v from 'valibot';
import type { Client } from '@atcute/client';
import { isActorIdentifier } from '@atcute/lexicons/syntax';
import { getServerClient } from './index';
import {
	EMPTY_PAGE,
	eventsQuery,
	happeningNowMeiliQuery,
	happeningNowQuery,
	hostingQuery,
	pastEventsQuery,
	searchD1Query,
	searchMeiliQuery,
	topicQuery,
	type EventsPage
} from './queries';
import { decodeCursor, type CursorEnvelope, type CursorQuery } from './cursor';

// The load-more remote input. Exactly two fields are read: `cursor`, the opaque
// continuation envelope naming the server-side query and its public-safe args,
// and `q`, the free-text search TERM — which stays OUT of the envelope and rides
// ?q=/input (see the search resumers). A client may POST extra query params;
// `v.object` drops them, so they are accepted WITHOUT being trusted.
export const listEventsInput = v.object({
	cursor: v.optional(v.string()),
	/** Free-text search term for the search page; ignored for every other query. */
	q: v.optional(v.string())
});

export type LoadMoreEventsInput = v.InferOutput<typeof listEventsInput>;

/** Load-more returns the same page shape a route's page-1 `load()` returns. */
export type LoadMoreEventsResult = EventsPage;

const EMPTY = EMPTY_PAGE;

/**
 * A resumer continues the query named by the envelope, from the envelope's
 * opaque `raw` keyset. It does not define the query: it validates the decoded
 * args at the trust boundary and hands them to the shared query in `queries.ts`
 * — the same function the route's page-1 `load()` calls.
 *
 * Malformed or missing required args end pagination cleanly (EMPTY); a resumer
 * never throws and never falls through to another query.
 */
type Resumer = (
	env: App.Platform['env'],
	client: Client,
	envelope: CursorEnvelope,
	searchTerm: string | undefined
) => Promise<EventsPage>;

// The query-name -> resumer REGISTRY. Adding a paginated list means defining its
// query in `queries.ts` and registering it here. The plain, unlisted-inclusive
// listRecords pipeline deliberately has NO entry, so no decoded envelope can
// reach it. (See README → "Load-more pagination".)
const REGISTRY: Record<CursorQuery, Resumer> = {
	events: async (_env, client, { args, raw }) =>
		eventsQuery(client, { popular: args?.popular === true }, raw),

	// Scoped by the clock, and optionally by a topic slug re-derived to a search
	// SERVER-side (never taken from the client). A term-scoped list carries its
	// term outside the envelope, exactly as the search resumers do.
	'happening-now': async (_env, client, { args, raw }, searchTerm) =>
		happeningNowQuery(client, raw, { slug: args?.slug, search: searchTerm }),

	// The Meili-ranked twin, used when the band is scoped by a free-text TERM so
	// that it and the list beside it run the same backend. Like the search
	// resumers the term rides ?q=/input rather than the envelope, so a lost term
	// ends pagination cleanly rather than continuing an unscoped live list.
	'happening-now-meili': async (env, client, { raw }, searchTerm) => {
		if (!searchTerm?.trim()) return EMPTY;
		return happeningNowMeiliQuery(env, client, { term: searchTerm }, raw);
	},

	hosting: async (_env, client, { args, raw }) => {
		const actor = args?.actor;
		if (!actor || !isActorIdentifier(actor)) return EMPTY;
		return hostingQuery(client, { actor }, raw);
	},

	'past-events': async (_env, client, { args, raw }) => {
		const actor = args?.actor;
		if (!actor || !isActorIdentifier(actor)) return EMPTY;
		return pastEventsQuery(client, { actor }, raw);
	},

	// The search text is re-derived SERVER-side from the slug inside topicQuery,
	// never taken from the client; an unknown slug ends cleanly.
	topic: async (_env, client, { args, raw }) => {
		const slug = args?.slug;
		if (!slug) return EMPTY;
		return topicQuery(client, { slug }, raw);
	},

	// Search is the one query whose defining input is not in the envelope: the
	// term rides ?q=/input. Lost term => end cleanly rather than continue an
	// unfiltered list.
	'search-d1': async (_env, client, { raw }, searchTerm) => {
		if (!searchTerm?.trim()) return EMPTY;
		return searchD1Query(client, { term: searchTerm }, raw);
	},

	'search-meili': async (env, client, { raw }, searchTerm) => {
		if (!searchTerm?.trim()) return EMPTY;
		return searchMeiliQuery(env, client, { term: searchTerm }, raw);
	}
};

/**
 * Shared load-more handler. Kept out of the `.remote.ts` adapter so it is a
 * plain function the SvelteKit remote-functions plugin won't wrap — that lets it
 * be unit-tested directly (the plugin rejects non-remote exports from
 * `*.remote.ts`, so a test there can't mock `$app/server`).
 *
 * Decode the envelope, look up its resumer, continue the shared query. A cursor
 * that fails to decode yields null and ends pagination cleanly.
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
