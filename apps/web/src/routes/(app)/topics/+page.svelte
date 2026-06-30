<script lang="ts">
	import { TOPICS } from '$lib/topics';
	import Icon from '@iconify/svelte';
</script>

<svelte:head>
	<title>Browse Topics — atmo.rsvp</title>
	<meta name="description" content="Find events by topic on the open social web." />
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-8">
		<h1 class="text-base-900 dark:text-base-50 text-3xl font-bold sm:text-4xl">Browse Topics</h1>
		<p class="text-base-500 dark:text-base-400 mt-3 text-lg">
			Find events about the things you care about.
		</p>
		<p class="text-base-400 dark:text-base-500 mt-3 text-sm">
			To have your event listed under a topic, include the relevant hashtag (e.g.
			<span class="text-base-600 dark:text-base-300 font-medium">#webdev</span> or
			<span class="text-base-600 dark:text-base-300 font-medium">#music</span>) in your event
			description. Each topic page shows which hashtags it tracks.
		</p>
	</div>

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
		{#each TOPICS as topic (topic.slug)}
			<a
				href="/topics/{topic.slug}"
				class="group flex items-center gap-3 rounded-xl border border-base-200 dark:border-base-800 px-4 py-3 transition-all hover:bg-base-50 dark:hover:bg-base-800/50 hover:shadow-md dark:hover:shadow-lg"
			>
				<div class="text-accent-600 dark:text-accent-400 shrink-0">
					<Icon icon={topic.icon} class="size-5 sm:size-6" />
				</div>
				<div class="min-w-0">
					<p class="text-base-900 dark:text-base-50 text-sm font-medium sm:text-base">{topic.name}</p>
					{#if topic.hashtags.length}
						<p class="text-base-400 dark:text-base-500 hidden text-xs sm:block">{topic.hashtags.join(' ')}</p>
					{/if}
				</div>
			</a>
		{/each}
	</div>
</div>
