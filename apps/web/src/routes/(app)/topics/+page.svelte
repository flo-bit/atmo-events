<script lang="ts">
	import { resolve } from '$app/paths';
	import { TOPICS } from '#lib/topics.js';
	import TopicIcon from '#lib/components/TopicIcon.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<meta name="description" content="Find events by topic on the open social web." />
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-8">
		<h1 class="text-base-900 dark:text-base-50 text-3xl font-bold sm:text-4xl">Browse Topics</h1>
		<p class="text-muted mt-3 text-lg">Find events about the things you care about.</p>
	</div>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
		{#each TOPICS as topic (topic.slug)}
			<a
				href={resolve('/(app)/topics/[slug]', { slug: topic.slug })}
				class="rounded-ui border-line bg-recess text-ink hover:border-accent-400 dark:hover:border-accent-600 flex min-h-18 items-center gap-3 border p-4 inset-shadow-sm transition-colors"
			>
				<div class="text-accent-600 dark:text-accent-400 flex shrink-0">
					<TopicIcon slug={topic.slug} class="size-6" />
				</div>
				<div class="min-w-0 flex-1">
					<span class="text-sm leading-snug font-medium break-words sm:text-base">{topic.name}</span
					>
					{#if data.topicCounts?.[topic.slug] !== undefined}
						<p
							class="text-muted mt-1 text-xs tabular-nums"
							title="Upcoming and ongoing events · updated daily"
						>
							{data.topicCounts[topic.slug]} upcoming
							{data.topicCounts[topic.slug] === 1 ? 'event' : 'events'}
						</p>
					{/if}
				</div>
			</a>
		{/each}
	</div>
</div>
