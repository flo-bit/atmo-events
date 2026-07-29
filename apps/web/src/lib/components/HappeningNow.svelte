<script lang="ts">
	import type { FlatEventRecord } from '$lib/contrail';
	import { resolve } from '$app/paths';
	import { EventCard } from '@atmo-dev/events-ui';

	// The "Happening Now" section, as ONE component. Home and EventList both show
	// it, and hand-copying it between them is how the copies drift: the first copy
	// had already lost the uri dedupe below.
	//
	// Imports no query runtime — this ships to every browser that loads a list.
	let {
		events,
		total = 0,
		totalIsFloor = false,
		seeAllHref = undefined,
		handles = {},
		actor = undefined,
		gridClass = 'grid gap-6 sm:grid-cols-2',
		headingClass = 'text-lg font-semibold',
		sectionClass = 'mb-12',
		headerClass = 'mb-4'
	}: {
		events: FlatEventRecord[];
		/** How many events are live in total, before the one-card-per-host cap. */
		total?: number;
		totalIsFloor?: boolean;
		/** Where "See all" goes. A SCOPED band must pass its own scope here, or the
		 *  count describes one set and the destination shows another.
		 *
		 *  MUST be built with resolve(), appending any query string afterwards (which
		 *  cannot go through it). The lint rule that would otherwise catch a raw path
		 *  cannot see through a prop, so it is suppressed at the href below and this
		 *  line is what that suppression rests on — a hand-written "/p/{actor}/hosting"
		 *  here silently loses a configured base path.
		 *
		 *  `null` means this band is ALREADY the whole set, so no link is offered —
		 *  the hosting page runs its band uncapped, and the global /events/now it
		 *  would otherwise fall back to is a different, wider list. */
		seeAllHref?: string | null | undefined;
		handles?: Record<string, string>;
		actor?: string | undefined;
		gridClass?: string;
		headingClass?: string;
		sectionClass?: string;
		headerClass?: string;
	} = $props();
</script>

<!--
	A section of its own rather than cards mixed into the upcoming grid: "under way"
	and "not started yet" are different questions, and a reader should not have to
	read a badge to tell which list they are looking at.

	The section shows one card per host (capped server-side), so it is a roll-call of
	who is live rather than a ranking of events. When that cap hides events, the link
	SAYS how many it is standing in front of: "See all 20". Without the number a
	block showing 2 of 20 reads as the complete list, and a reader with no reason to
	think anything is missing has no reason to follow the link.
-->
{#if events.length > 0}
	<section class={sectionClass}>
		<div class="flex items-baseline justify-between gap-4 {headerClass}">
			<h2 class="text-base-900 dark:text-base-50 {headingClass}">Happening Now</h2>
			{#if seeAllHref !== null}
				<!-- The rule cannot see through a prop, and the href is not on the line a
				     disable-NEXT-LINE would cover, so the suppression brackets the element.
				     What it is standing on is the contract on `seeAllHref` above: every
				     caller passes a resolve()-built href. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={seeAllHref ?? resolve('/(app)/events/now')}
					class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
				>
					{#if total > events.length}
						See all {total}{totalIsFloor ? '+' : ''} &rarr;
					{:else}
						See all &rarr;
					{/if}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>

		<div class={gridClass}>
			{#each events as event (event.uri)}
				<EventCard {event} actor={actor ?? handles[event.did]} />
			{/each}
		</div>
	</section>
{/if}
