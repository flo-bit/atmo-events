<script lang="ts">
	import EventList from '#lib/components/EventList.svelte';
	import TopicIcon from '#lib/components/TopicIcon.svelte';
	import { resolve } from '$app/paths';
	import { Icon } from '@atmo-dev/kit';
	import { ChevronLeft } from '@sketchyicons/svelte';

	let { data } = $props();

	// The live band's "See all" carries this topic to /events/now, so the count it
	// shows and the page it opens describe the same set. resolve() covers the base
	// path; the query string is appended after, as it cannot go through resolve().
	let ongoingSeeAllHref = $derived(
		`${resolve('/(app)/events/now')}?topic=${encodeURIComponent(data.topic.slug)}`
	);
</script>

<svelte:head>
	<meta
		name="description"
		content={data.topic.byline ?? `Find ${data.topic.name} events on the open social web.`}
	/>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<header class="mb-10">
		<a
			href="/topics"
			class="text-muted hover:text-ink mb-6 inline-flex items-center gap-1 text-sm transition-colors"
		>
			<Icon img={ChevronLeft} size={16} />
			All topics
		</a>
		<div class="flex items-center gap-3 sm:gap-4">
			<div class="text-accent-600 dark:text-accent-400 shrink-0">
				<TopicIcon slug={data.topic.slug} class="size-8 sm:size-10" />
			</div>
			<h1 class="text-ink text-3xl font-bold sm:text-4xl">{data.topic.name}</h1>
		</div>
		{#if data.topic.hashtags.length}
			<div class="text-muted mt-4 text-sm">
				<ul class="flex flex-wrap gap-x-3 gap-y-1" aria-label="Tracked hashtags">
					{#each data.topic.hashtags as hashtag (hashtag)}
						<li class="max-w-full break-words">{hashtag}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</header>

	{#if data.events.length === 0 && data.ongoing.length === 0}
		<div class="py-16 text-center">
			<p class="text-muted text-lg">No events found for this topic yet.</p>
			<p class="text-base-400 dark:text-base-500 mt-2 text-sm">
				Try posting an event with {data.topic.hashtags[0]} to be the first!
			</p>
		</div>
	{:else}
		<EventList
			events={data.events}
			cursor={data.cursor}
			handles={data.handles}
			ongoing={data.ongoing}
			ongoingTotal={data.ongoingTotal}
			ongoingTotalIsFloor={data.ongoingTotalIsFloor}
			{ongoingSeeAllHref}
		/>
	{/if}
</div>
