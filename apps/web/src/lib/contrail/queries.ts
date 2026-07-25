// The paginated list queries — ONE definition per list, called by BOTH the
// route's page-1 `load()` and the load-more resumer.
//
// Page 1 and load-more are separate server entry points by necessity: an SSR
// `load()` that has `url`/`params`, and a remote command that has only an opaque
// cursor. A keyset cursor is specific to the query that produced it, so page 2
// is adjacent to page 1 only while every filter, sort, bound and limit agrees.
// One definition called from both entry points makes that agreement structural,
// rather than a property two call sites have to keep in step.
//
// Each query owns its filter values, any post-filter, and the envelope that
// continues it. Args arrive already validated — the trust boundary is
// `decodeCursor` for load-more and route `params` for page 1 — so a query
// receives values, never client input. See README → "Load-more pagination".

import type { Client } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons';
import {
	flattenEventRecords,
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { runEventSearchPage, searchBackendFromEnv } from '$lib/search/server/query';
import { SEARCH_PAGE_SIZE } from '$lib/search/constants';
import { orQueryFromSlug } from '$lib/topics';
import { hasEnded } from '$lib/past-events';
import { nextCursor, type CursorArgs, type CursorQuery } from './cursor';

export const PAGE_SIZE = 20;

/**
 * One page of events plus the token that continues it. Page 1 and load-more
 * return the SAME shape — routes spread it and add their own page data.
 */
export type EventsPage = {
	events: ReturnType<typeof flattenEventRecords>;
	handles: Record<string, string>;
	cursor: string | null;
};

export const EMPTY_PAGE: EventsPage = { events: [], handles: {}, cursor: null };

function now(): string {
	return new Date().toISOString();
}

/**
 * Shape a contrail list response into a page, minting the next-page envelope for
 * the SAME query name + scope args, so a continuation can only resume this query.
 */
function toPage(
	q: CursorQuery,
	args: CursorArgs | undefined,
	response: Awaited<ReturnType<typeof listDiscoverableEventsFromContrail>>
): EventsPage {
	if (!response) return EMPTY_PAGE;
	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}
	return {
		events: flattenEventRecords(response.records ?? []),
		handles,
		cursor: nextCursor(q, response.cursor ?? null, args)
	};
}

/** The home discovery feed: upcoming, discoverable, soonest first. */
export async function eventsQuery(
	client: Client,
	args: { popular: boolean },
	cursor: string | null | undefined
): Promise<EventsPage> {
	const response = await listDiscoverableEventsFromContrail(client, {
		startsAtMin: now(),
		profiles: true,
		sort: 'startsAt',
		order: 'asc',
		limit: PAGE_SIZE,
		...(args.popular ? { rsvpsCountMin: 2 } : {}),
		cursor: cursor ?? undefined
	});
	return toPage('events', { popular: args.popular }, response);
}

/** A profile's upcoming events: authored by this actor, soonest first. */
export async function hostingQuery(
	client: Client,
	args: { actor: ActorIdentifier },
	cursor: string | null | undefined
): Promise<EventsPage> {
	const response = await listAuthoredEventsFromContrail(client, {
		actor: args.actor,
		startsAtMin: now(),
		sort: 'startsAt',
		order: 'asc',
		profiles: true,
		limit: PAGE_SIZE,
		cursor: cursor ?? undefined
	});
	return toPage('hosting', { actor: args.actor }, response);
}

/**
 * A profile's past events: authored by this actor, most recent first.
 *
 * The D1 bound is `startsAtMax`, which still admits an event that began earlier
 * and is STILL RUNNING, so the result is narrowed to events that have actually
 * ended. The narrowing lives in the query, so every page inherits it.
 *
 * It runs AFTER pagination: the cursor reflects the unfiltered keyset position,
 * which is what keeps page 2 adjacent to page 1. A page can therefore come back
 * short — or empty while more pages remain — so a caller must keep its "load
 * more" affordance alive for as long as there is a cursor, not for as long as
 * the page has events.
 */
export async function pastEventsQuery(
	client: Client,
	args: { actor: ActorIdentifier },
	cursor: string | null | undefined
): Promise<EventsPage> {
	const asOf = now();
	const response = await listAuthoredEventsFromContrail(client, {
		actor: args.actor,
		startsAtMax: asOf,
		sort: 'startsAt',
		order: 'desc',
		profiles: true,
		limit: PAGE_SIZE,
		cursor: cursor ?? undefined
	});
	const page = toPage('past-events', { actor: args.actor }, response);
	return { ...page, events: page.events.filter((e) => hasEnded(e, asOf)) };
}

/**
 * A topic list: upcoming discoverable events matching ANY of the topic's
 * hashtag terms. The search string is derived from the slug SERVER-side, so a
 * caller can never supply the query text. An unknown slug yields an empty page.
 */
export async function topicQuery(
	client: Client,
	args: { slug: string },
	cursor: string | null | undefined
): Promise<EventsPage> {
	const search = orQueryFromSlug(args.slug);
	if (!search) return EMPTY_PAGE;
	const response = await listDiscoverableEventsFromContrail(client, {
		search,
		startsAtMin: now(),
		sort: 'startsAt',
		order: 'asc',
		profiles: true,
		limit: PAGE_SIZE,
		cursor: cursor ?? undefined
	});
	return toPage('topic', { slug: args.slug }, response);
}

/**
 * Free-text search, D1 LIKE path — the degraded backend used when Meilisearch
 * is unconfigured or down. Upcoming-only, matching the Meili path; an empty term
 * yields an empty page rather than an unfiltered list.
 */
export async function searchD1Query(
	client: Client,
	args: { term: string },
	cursor: string | null | undefined
): Promise<EventsPage> {
	const term = args.term.trim();
	if (!term) return EMPTY_PAGE;
	const response = await listDiscoverableEventsFromContrail(client, {
		search: term,
		startsAtMin: now(),
		sort: 'startsAt',
		order: 'desc',
		profiles: true,
		limit: SEARCH_PAGE_SIZE,
		cursor: cursor ?? undefined
	});
	return toPage('search-d1', undefined, response);
}

/**
 * Free-text search, Meilisearch path: Meili ranks, D1 supplies the records. An
 * empty term or unconfigured backend yields an empty page — page 1 falls back to
 * D1 on failure, but a CONTINUATION must not, or it would restart page 1 on the
 * other backend with a keyset that backend can't read.
 */
export async function searchMeiliQuery(
	env: App.Platform['env'] | undefined,
	client: Client,
	args: { term: string },
	cursor: string | null | undefined
): Promise<EventsPage> {
	const term = args.term.trim();
	const backend = term ? searchBackendFromEnv(env) : null;
	if (!term || !backend) return EMPTY_PAGE;
	// Omit `cursor` entirely on a fresh page rather than passing null: page 1 and
	// the resumer then issue byte-identical calls apart from the keyset itself.
	const page = await runEventSearchPage(backend, client, {
		q: term,
		...(cursor ? { cursor } : {})
	});
	return {
		events: page.events,
		handles: page.handles,
		cursor: nextCursor('search-meili', page.cursor)
	};
}
