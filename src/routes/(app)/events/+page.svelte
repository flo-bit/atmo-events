<script lang="ts">
	import EventList from '$lib/components/EventList.svelte';

	let { data } = $props();

	const fetchParams = {
		startsAtMin: new Date().toISOString(),
		profiles: 'true',
		sort: 'startsAt',
		order: 'asc',
		limit: '20'
	};
</script>

<svelte:head>
	<title>All Upcoming Events</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-8 text-2xl font-bold">Upcoming Events</h1>

	{#if data.events.length === 0}
		<p class="text-base-500 text-center text-lg">No upcoming events found.</p>
	{:else}
		<EventList events={data.events} cursor={data.cursor} handles={data.handles} {fetchParams} />
	{/if}
</div>
