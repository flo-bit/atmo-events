<script lang="ts">
	import EventList from '$lib/components/EventList.svelte';

	let { data } = $props();

	// Query is built server-side and passed through `data` so the two stay in
	// sync. Mirrors the search page. The topic page is first-batch-only
	// (data.cursor is null), so these params are only a contract for EventList,
	// not an active pagination path.
	let fetchParams = $derived({
		search: data.query,
		profiles: 'true',
		sort: 'startsAt',
		order: 'asc',
		limit: '20'
	});
</script>

<svelte:head>
	<title>{data.topic.name} Events — atmo.rsvp</title>
	<meta
		name="description"
		content={data.topic.byline ?? `Find ${data.topic.name} events on the open social web.`}
	/>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="relative mb-10 overflow-hidden rounded-2xl">
		<div class="aspect-[21/9] w-full overflow-hidden">
			<img
				src={data.topic.image}
				alt={data.topic.name}
				class="h-full w-full object-cover"
			/>
		</div>
		<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
		<div class="absolute bottom-0 left-0 p-6">
			<a
				href="/topics"
				class="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
					<path fill-rule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" />
				</svg>
				All topics
			</a>
			<h1 class="text-3xl font-bold text-white sm:text-4xl">{data.topic.name}</h1>
			{#if data.topic.byline}
				<p class="mt-1 text-white/75">{data.topic.byline}</p>
			{/if}
			{#if data.topic.hashtags.length}
				<p class="mt-2 text-sm text-white/50">{data.topic.hashtags.join(' ')}</p>
			{/if}
		</div>
	</div>

	{#if data.events.length === 0}
		<div class="py-16 text-center">
			<p class="text-base-500 dark:text-base-400 text-lg">No events found for this topic yet.</p>
			<p class="text-base-400 dark:text-base-500 mt-2 text-sm">
				Try posting an event with {data.topic.hashtags[0]} to be the first!
			</p>
		</div>
	{:else}
		<EventList
			events={data.events}
			cursor={data.cursor}
			handles={data.handles}
			{fetchParams}
		/>
	{/if}
</div>
