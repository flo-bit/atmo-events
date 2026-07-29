// Events that are HAPPENING RIGHT NOW — the band `startsAt <= now < endsAt` — as a
// PREVIEW merged into another list. `happeningNowQuery` in queries.ts serves the
// same band as a page of its own; this one is bounded, cursorless and capped, which
// is what lets it lead a list without touching that list's keyset.
//
// WIDENING THE FEED'S OWN `startsAtMin: now` BOUND INSTEAD was measured and
// rejected twice, and both reasons still hold:
//
//  1. It DELETES events. contrail compiles a range filter to a bare comparison
//     (`json_extract(record,'$.endsAt') >= ?`), and SQL `NULL >= 'x'` is NULL, not
//     true. 7.1% of upcoming events (75 of 1063, all 73 of one publisher's) carry
//     no endsAt, so an endsAt bound on the feed erases them.
//  2. It RANKS UPSIDE DOWN. The keyset IS the sort column, so the sort must stay
//     `startsAt asc`; ongoing events start in the past and so lead the feed ordered
//     by how long ago they began. Measured live: page 1 became 100% ongoing, headed
//     by a 364-day standing event, and that evening's events fell to page 2.
//
// Sorting by endsAt ASC — soonest-ending first — answers what a reader is actually
// asking (what can I still catch?) and is the exact inverse of what widening gives.

import type { Client } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons';
import type { FlatEventRecord } from '@atmo-dev/events-ui';
import {
	flattenEventRecords,
	listAuthoredEventsFromContrail,
	listDiscoverableEventsFromContrail
} from '$lib/contrail';
import { runOngoingSearchPage, searchBackendFromEnv } from '$lib/search/server/query';

/**
 * How many ongoing events one actor may contribute to a merged list.
 *
 * ONE, making the block a roll-call of who is live rather than a ranking of events:
 * every publisher gets a card, so a quiet publisher with one event is never pushed
 * out by a loud one. Measured 2026-07-26 — 34 ongoing across 4 publishers, 25 of
 * them one publisher's — three per actor gave 8 cards of which 6 were the two
 * loudest; one per actor gives 4, one each. Block length tracks how many publishers
 * are live, not how many events they run.
 *
 * What the cap holds back is NOT reported inline. The section already carries a
 * "See all" link to /events/now, which runs the same band uncapped — a second,
 * per-publisher accounting of the same fact costs a module, three payload fields
 * and a paragraph of template to restate what that link already offers.
 */
export const ONGOING_PER_ACTOR = 1;

/**
 * Upper bound on the rows pulled before capping.
 *
 * The cap keeps one row per publisher, so this bounds how many DISTINCT publishers
 * the block can discover, not how many cards it shows: a publisher running 25 live
 * events consumes 25 of these rows to yield one card. 100 is comfortable against a
 * measured 34 ongoing network-wide, and is what contrail clamps a page to anyway.
 * (It was 200 to make per-publisher overflow counts exact; nothing counts now.)
 */
export const ONGOING_FETCH_LIMIT = 100;

/**
 * Ceiling on a SCOPED band (a search term, a topic, a profile), which is not
 * capped per host.
 *
 * The per-host cap answers "who is live?" on a global surface, where one loud
 * publisher would otherwise crowd out quiet ones. A scoped band is not that
 * question: the reader asked for `town`, and if two live events match, both are
 * the answer — hiding one because they share a host makes the section wrong and
 * forces a "See all 2" for a set small enough to have just shown. Same reasoning
 * that already exempts a profile page: it IS one publisher's list.
 *
 * A ceiling still applies, because the band sits ABOVE the list it introduces and
 * a broad topic can be live in bulk. Past it, the count and the link return.
 */
export const ONGOING_SCOPED_MAX = 6;

export type OngoingEvents = {
	events: FlatEventRecord[];
	handles: Record<string, string>;
	/**
	 * How many events are live in total, BEFORE the per-actor cap — so a block
	 * showing one card per host can say how many it stands for.
	 *
	 * The cap can hide 90% of the band (measured on testnet: 2 cards for 20 live
	 * events, both from the same two hosts), and a block that shows 2 of 20 with no
	 * count reads as the complete list. The section link alone does not fix that: a
	 * reader with no reason to think anything is missing has no reason to follow it.
	 *
	 * ONE number, not a per-host breakdown. What a reader needs is "there is more
	 * than this"; which host holds how many is a question /events/now answers.
	 */
	total: number;
	/** True when the fetch hit ONGOING_FETCH_LIMIT, making `total` a floor ("20+"). */
	totalIsFloor: boolean;
};

export const EMPTY_ONGOING: OngoingEvents = {
	events: [],
	handles: {},
	total: 0,
	totalIsFloor: false
};
/**
 * Keep at most `limit` events per actor and count what was withheld. Pure, and
 * order-preserving: survivors are each actor's FIRST `limit` in the caller's order,
 * so an endsAt-asc input keeps their soonest-ending.
 */
export function capPerActor(
	events: FlatEventRecord[],
	limit: number = ONGOING_PER_ACTOR
): FlatEventRecord[] {
	const kept: FlatEventRecord[] = [];
	const seen: Record<string, number> = {};

	for (const event of events) {
		const n = (seen[event.did] ?? 0) + 1;
		seen[event.did] = n;
		if (n <= limit) kept.push(event);
	}

	return kept;
}

/**
 * The ongoing band. Pass `actor` to scope to one profile (the hosting page), or
 * omit it for the discoverable network-wide feed (home, /events).
 *
 * A profile-scoped band (`actor`) is not capped: the cap exists to stop one
 * publisher dominating a SHARED list, and a profile page is that publisher's own
 * list.
 */
export async function ongoingQuery(
	client: Client,
	args: {
		actor?: ActorIdentifier;
		search?: string;
	} = {}
): Promise<OngoingEvents> {
	const now = new Date().toISOString();
	const params = {
		startsAtMax: now,
		endsAtMin: now,
		sort: 'endsAt',
		// A range field defaults to `desc` in contrail's router; soonest-ending
		// first is the whole point here, so `asc` is passed explicitly.
		order: 'asc' as const,
		profiles: true,
		limit: ONGOING_FETCH_LIMIT,
		// Topics and search scope the band to what the reader is looking at. Always
		// derived SERVER-side (a slug via orQueryFromSlug, or a validated search
		// term), never echoed from a cursor.
		...(args.search ? { search: args.search } : {})
	};

	const response = args.actor
		? await listAuthoredEventsFromContrail(client, { ...params, actor: args.actor })
		: await listDiscoverableEventsFromContrail(client, params);

	if (!response) return EMPTY_ONGOING;

	const handles: Record<string, string> = {};
	for (const p of response.profiles ?? []) {
		if (p.handle) handles[p.did] = p.handle;
	}

	const records = response.records ?? [];
	const flattened = flattenEventRecords(records);

	// Scoped by something the reader chose (a profile, a term, a topic) => show the
	// matches, bounded. Unscoped (home, /events) => one card per host, so the block
	// is a roll-call of who is live rather than a ranking of events.
	const scoped = Boolean(args.actor || args.search);
	const capped = scoped
		? flattened.slice(0, args.actor ? flattened.length : ONGOING_SCOPED_MAX)
		: capPerActor(flattened, ONGOING_PER_ACTOR);

	return {
		events: capped,
		handles,
		total: records.length,
		totalIsFloor: records.length >= ONGOING_FETCH_LIMIT
	};
}

/**
 * The band for a FREE-TEXT term, ranked by the search backend rather than D1.
 *
 * `/search` is the one surface whose list does not come from D1, and a band that
 * disagrees with the list beside it is not a cosmetic difference: `EventList`
 * promotes any live event out of that list into the band, so the band can show
 * events this query never returned — and the "see all" destination, running the
 * same backend as the band, then could not contain them. Measured on testnet: a
 * band of 2 linking to a page of 1, the missing one a year-long event Meili
 * ranked for the term and D1 did not.
 *
 * Returns null when the backend is unconfigured or the query fails, which is the
 * caller's signal to fall back to the D1 band — page 1 may switch backends, a
 * continuation may not.
 */
export async function ongoingSearchQuery(
	env: App.Platform['env'] | undefined,
	client: Client,
	args: { term: string }
): Promise<OngoingEvents | null> {
	const term = args.term.trim();
	const backend = term ? searchBackendFromEnv(env) : null;
	if (!backend) return null;

	try {
		const page = await runOngoingSearchPage(backend, client, { q: term });
		// A term is a scope the reader chose, so no per-host cap — same rule the D1
		// band follows. The ceiling still applies: the band sits above the list it
		// introduces.
		return {
			events: page.events.slice(0, ONGOING_SCOPED_MAX),
			handles: page.handles,
			total: page.events.length,
			// One page of hits, so a full page means "at least this many".
			totalIsFloor: page.cursor !== null
		};
	} catch (err) {
		console.error('ongoing band search backend failed, falling back to D1:', err);
		return null;
	}
}

/** Merge a band into a list page's payload. One helper so the six routes that show
 *  the band cannot drift on the three things they each have to get right: the band
 *  is page-1 only (a `?cursor=` continuation is resuming the upcoming keyset, where
 *  these events are already above the reader), a band failure must not take the
 *  whole page down with it, and the page's own handles win the merge. */
export async function withOngoing<T extends { handles?: Record<string, string> }>(
	page: T,
	band: Promise<OngoingEvents> | null
): Promise<
	T & {
		ongoing: FlatEventRecord[];
		ongoingTotal: number;
		ongoingTotalIsFloor: boolean;
		handles: Record<string, string>;
	}
> {
	const ongoing = band ? await band.catch(() => EMPTY_ONGOING) : EMPTY_ONGOING;
	return {
		...page,
		ongoing: ongoing.events,
		ongoingTotal: ongoing.total,
		ongoingTotalIsFloor: ongoing.totalIsFloor,
		handles: { ...ongoing.handles, ...(page.handles ?? {}) }
	};
}
