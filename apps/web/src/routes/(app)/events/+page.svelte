<script lang="ts">
	import EventList from '$lib/components/EventList.svelte';
	import { ToggleGroup, ToggleGroupItem } from '@foxui/core';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	let filter = $derived(page.url.searchParams.get('filter') === 'all' ? 'all' : 'popular');

	function setFilter(val: string) {
		const url = new URL(page.url);
		if (val === 'all') url.searchParams.set('filter', 'all');
		else url.searchParams.delete('filter');
		url.searchParams.delete('cursor');
		goto(url, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>All Upcoming Events</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-8 flex flex-wrap items-center justify-between gap-4">
		<!-- The page title covers both sections below it; each names itself. -->
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">Events</h1>
	</div>

	<!-- The popular/all filter belongs to the UPCOMING half. It used to sit in the
	     page header, where the section directly under it was "Happening Now" — the
	     one list it does not filter — so the page read as broken: you toggle, and
	     the thing under the toggle does not move. -->
	{#snippet upcomingHeader()}
		<div class="mb-4 flex flex-wrap items-baseline justify-between gap-4">
			<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Upcoming</h2>
			<ToggleGroup
				type="single"
				bind:value={
					() => filter,
					(val) => {
						if (val) setFilter(val);
					}
				}
				class="w-fit"
				size="xs"
			>
				<ToggleGroupItem value="popular">Popular</ToggleGroupItem>
				<ToggleGroupItem value="all">All</ToggleGroupItem>
			</ToggleGroup>
		</div>
	{/snippet}

	<EventList
		events={data.events}
		cursor={data.cursor}
		handles={data.handles}
		ongoing={data.ongoing}
		ongoingTotal={data.ongoingTotal}
		ongoingTotalIsFloor={data.ongoingTotalIsFloor}
		{upcomingHeader}
	/>

	{#if data.events.length === 0}
		<p class="text-base-500 py-8 text-center text-lg">
			{#if filter === 'popular'}
				No popular events right now. <button
					type="button"
					onclick={() => setFilter('all')}
					class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 font-medium underline-offset-2 hover:underline"
				>
					See all events &rarr;
				</button>
			{:else}
				No upcoming events found.
			{/if}
		</p>
	{/if}
</div>
