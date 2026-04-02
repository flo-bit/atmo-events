<script lang="ts">
	import EventList from '$lib/components/EventList.svelte';
	import { Input, Button } from '@foxui/core';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let query = $state(data.query);

	function handleSearch(e: Event) {
		e.preventDefault();
		const q = query.trim();
		if (q) {
			goto(`/search?q=${encodeURIComponent(q)}`);
		}
	}
</script>

<svelte:head>
	<title>{data.query ? `"${data.query}" - Search` : 'Search Events'}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-6 text-2xl font-bold">Search Events</h1>

	<form onsubmit={handleSearch} class="mb-8 flex gap-2">
		<Input
			type="text"
			bind:value={query}
			placeholder="Search by name, description..."
			class="flex-1"
		/>
		<Button type="submit" disabled={!query.trim()}>Search</Button>
	</form>

	{#if data.query}
		{#if data.events.length === 0}
			<p class="text-base-500 py-8 text-center">No events found for "{data.query}".</p>
		{:else}
			<EventList
				events={data.events}
				cursor={data.cursor}
				handles={data.handles}
				fetchParams={{
					search: data.query,
					profiles: 'true',
					sort: 'startsAt',
					order: 'desc',
					limit: '20'
				}}
			/>
		{/if}
	{/if}
</div>
