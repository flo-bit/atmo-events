<script lang="ts">
	import EventCard from '$lib/components/EventCard.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>All Upcoming Events</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-8 text-2xl font-bold">Upcoming Events</h1>

	{#if data.events.length === 0}
		<p class="text-base-500 text-center text-lg">No upcoming events found.</p>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2">
			{#each data.events as event (event.uri)}
				<EventCard {event} actor={data.handles[event.did]} />
			{/each}
		</div>

		{#if data.cursor}
			<div class="mt-8 text-center">
				<a
					href="?cursor={data.cursor}"
					class="bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50 hover:bg-base-300 dark:hover:bg-base-700 inline-block rounded-xl px-5 py-2 text-sm font-medium transition-colors"
				>
					Load more
				</a>
			</div>
		{/if}
	{/if}
</div>
