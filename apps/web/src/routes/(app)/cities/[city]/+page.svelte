<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon } from '@atmo-dev/kit';
	import { ChevronLeft } from '@sketchyicons/svelte';
	import { cityContext } from '#lib/cities.js';
	import EventList from '#lib/components/EventList.svelte';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<header class="mb-8">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={`${resolve('/(app)/cities')}?choose=1`}
			class="text-base-600 dark:text-base-400 hover:text-base-950 dark:hover:text-base-50 mb-6 inline-flex items-center gap-1 text-sm transition-colors"
		>
			<Icon img={ChevronLeft} size={16} />
			Change city
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">
			Events in {data.city.city}
		</h1>
		{#if cityContext(data.city)}
			<p class="text-base-600 dark:text-base-400 mt-3">{cityContext(data.city)}</p>
		{/if}
	</header>

	{#if data.events.length === 0 && !data.cursor}
		<p class="text-base-600 dark:text-base-400 py-12 text-center">
			No upcoming events in this city.
		</p>
	{:else}
		<EventList
			events={data.events}
			cursor={data.cursor}
			handles={data.handles}
			separateOngoing={false}
		/>
	{/if}
</div>
