<script lang="ts">
	import EventList from '$lib/components/EventList.svelte';
	import { resolve } from '$app/paths';

	let { data } = $props();

	// The way out keeps the scope the reader arrived with: a term to that search, a
	// topic to that topic, and only an unscoped page to the global upcoming list.
	// Built through resolve() so every one of them stays base-path safe; the query
	// string is appended after, as the search page does, because resolve() cannot
	// carry it.
	let upcomingHref = $derived.by(() => {
		if (data.term) return `${resolve('/(app)/search')}?q=${encodeURIComponent(data.term)}`;
		if (data.slug) return resolve('/(app)/topics/[slug]', { slug: data.slug });
		return resolve('/(app)/events');
	});
</script>

<svelte:head>
	<title>Happening Now</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-2 flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">
			Happening Now{#if data.scopeLabel}<span class="text-base-500 dark:text-base-400 font-normal"
					>&nbsp;&middot; {data.scopeLabel}</span
				>{/if}
		</h1>
		<!-- resolve() covers the base path; the query string can't go through it, so
		     the rule can't see the route is resolved. `upcomingHref` is built from
		     resolve() above, so navigation stays base-path safe. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={upcomingHref}
			class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
		>
			Upcoming events &rarr;
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
	<!-- The counted lists elsewhere show one event per host and point here for the
	     rest, so this page carries no cap of any kind. -->
	<p class="text-base-500 dark:text-base-400 mb-8 text-sm">
		Every event under way right now, soonest to finish first.
	</p>

	{#if data.events.length === 0}
		<p class="text-base-500 text-center text-lg">Nothing is happening right now.</p>
	{:else}
		<!-- Every event here is live by construction, so there is no second kind to
		     split them from: the section would swallow the page, repeat the heading
		     above it, and link "See all" back to this page. -->
		<EventList
			events={data.events}
			cursor={data.cursor}
			handles={data.handles}
			q={data.term}
			separateOngoing={false}
		/>
	{/if}
</div>
