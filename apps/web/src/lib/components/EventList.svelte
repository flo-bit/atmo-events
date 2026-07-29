<script lang="ts">
	import type { FlatEventRecord } from '$lib/contrail';
	import HappeningNow from './HappeningNow.svelte';
	import { loadMoreEvents } from '$lib/contrail/events.remote';
	import { dedupeByUri } from '$lib/dedupe-by-uri';
	// Soonest-ending first, the order the band itself is sorted in — by instant,
	// not by text, since these records carry timestamps exactly as written.
	import { bySoonestEnding } from '$lib/live-order';
	import { EventCard, isEventOngoing } from '@atmo-dev/events-ui';
	import type { Snippet } from 'svelte';

	let {
		events,
		cursor,
		handles = {},
		actor = undefined,
		q = undefined,
		ongoing = [],
		ongoingTotal = 0,
		ongoingTotalIsFloor = false,
		ongoingSeeAllHref = undefined,
		separateOngoing = true,
		upcomingHeader = undefined,
		gridClass = 'grid gap-6 sm:grid-cols-2'
	}: {
		events: FlatEventRecord[];
		cursor: string | null;
		handles?: Record<string, string>;
		actor?: string | undefined;
		// Events happening RIGHT NOW, soonest-ending first, already capped per
		// actor server-side. They render at the head of this same list — an
		// in-progress event is a current event, not a past one — and carry no
		// cursor of their own, so the keyset below is untouched by their presence.
		ongoing?: FlatEventRecord[];
		ongoingTotal?: number;
		ongoingTotalIsFloor?: boolean;
		// `null` = this band is already the whole set, so offer no link (the hosting
		// page); `undefined` = fall back to the global /events/now.
		ongoingSeeAllHref?: string | null | undefined;
		// Whether live events are split into their own section. TRUE for a mixed
		// list, where "under way" and "not started yet" are different questions.
		// FALSE for /events/now, where every event is live by construction — there
		// is nothing to separate them FROM, so the split produces a section that
		// swallows the whole page, repeats the page's own "Happening Now" heading
		// under it, and offers a "See all" back to the page the reader is on.
		separateOngoing?: boolean;
		// Heading for the upcoming half, when the page has controls that belong
		// beside it. Rendered whether or not either list has anything, so those
		// controls keep their place instead of moving as the data changes.
		upcomingHeader?: Snippet;
		// The cursor is now a fully opaque, self-describing continuation envelope:
		// load-more POSTs only { cursor }, no client-echoed pipeline/
		// filters. The single exception is the free-text search TERM, which stays
		// OUT of the envelope and rides here so the search page's load-more can
		// re-run its query; other pages leave it undefined.
		q?: string | undefined;
		gridClass?: string;
	} = $props();

	let extraEvents = $state<FlatEventRecord[]>([]);
	let currentCursor = $state<string | null>(null);
	let currentHandles = $state<Record<string, string>>({});
	let loading = $state(false);

	$effect(() => {
		currentCursor = cursor;
		extraEvents = [];
		currentHandles = { ...handles };
	});

	// Dedupe by uri so the keyed {#each}es below cannot collide: a dirty source
	// (e.g. the D1 FTS path fanning one event out across duplicate fts rows) or a
	// uri overlapping between the initial page and a loadMore page would otherwise
	// repeat a key and crash hydration with each_key_duplicate.
	let listed = $derived(dedupeByUri([...events, ...extraEvents]));

	// WHICH SECTION AN EVENT BELONGS IN IS DECIDED BY ONE PREDICATE — the same
	// isEventOngoing that draws the "Live" badge — never by which query returned it.
	//
	// Membership of the band is not that predicate. The band is a D1 query and the
	// list beside it can come from Meilisearch, and the two do not agree on what
	// matches a term: searching "town" ranked a year-long event that is genuinely
	// under way (started 2026-07-19, ends 2027-07-04), which the band's D1 query
	// did not return. It therefore escaped the band, failed the old
	// "is it in `ongoing`?" test, and rendered under "Upcoming" wearing a Live
	// badge — the heading and the badge contradicting each other on one card.
	//
	// Promoting it here fixes that by construction, and keeps working whatever the
	// two queries disagree about next.
	let liveEvents = $derived(
		separateOngoing
			? dedupeByUri([
					...ongoing,
					...listed.filter((e) => isEventOngoing(e.startsAt, e.endsAt))
				]).sort(bySoonestEnding)
			: []
	);
	// A Set, not `.some()` per item: this re-runs on every load-more, so a linear
	// scan per upcoming event makes a long scroll quadratic.
	let liveUris = $derived(new Set(liveEvents.map((e) => e.uri)));
	let upcomingEvents = $derived(listed.filter((e) => !liveUris.has(e.uri)));
	async function loadMore() {
		if (!currentCursor || loading) return;

		loading = true;

		try {
			// Opaque token in, opaque token out: the envelope names the server-side
			// query, so there is no client-side query reconstruction to echo. Only
			// the search term (when present) rides alongside the cursor.
			const result = await loadMoreEvents({
				cursor: currentCursor,
				...(q !== undefined ? { q } : {})
			});

			extraEvents = [...extraEvents, ...result.events];
			currentCursor = result.cursor;

			if (result.handles) {
				currentHandles = { ...currentHandles, ...result.handles };
			}
		} catch (err) {
			console.error('Failed to load more events:', err);
		} finally {
			loading = false;
		}
	}
</script>

<HappeningNow
	events={liveEvents}
	total={Math.max(ongoingTotal, liveEvents.length)}
	totalIsFloor={ongoingTotalIsFloor}
	seeAllHref={ongoingSeeAllHref}
	handles={currentHandles}
	{actor}
	{gridClass}
/>

<!-- A page with a control that filters THIS list (the /events popular/all toggle)
     passes its own header, so the control sits beside what it changes rather than
     in the page header above the live section, which it does not touch. Otherwise
     a plain heading, and only when a live section sits above it: with nothing
     above, the page's own title already says what this list is. -->
{#if upcomingHeader}
	{@render upcomingHeader()}
{:else if liveEvents.length > 0 && upcomingEvents.length > 0}
	<h2 class="text-base-900 dark:text-base-50 mb-4 text-lg font-semibold">Upcoming</h2>
{/if}

<div class={gridClass}>
	{#each upcomingEvents as event (event.uri)}
		<EventCard {event} actor={actor ?? currentHandles[event.did]} />
	{/each}
</div>

{#if currentCursor}
	<div class="mt-8 text-center">
		<button
			onclick={loadMore}
			disabled={loading}
			class="bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50 hover:bg-base-300 dark:hover:bg-base-700 inline-block rounded-xl px-5 py-2 text-sm font-medium transition-colors"
		>
			{loading ? 'Loading...' : 'Load more'}
		</button>
	</div>
{/if}
