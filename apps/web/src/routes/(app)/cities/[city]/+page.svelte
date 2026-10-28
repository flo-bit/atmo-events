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
		<a
			href={resolve('/(app)/cities')}
			class="text-muted hover:text-ink mb-6 inline-flex items-center gap-1 text-sm transition-colors"
		>
			<Icon img={ChevronLeft} size={16} />
			All cities
		</a>
		<h1 class="text-ink text-3xl font-bold sm:text-4xl">Events in {data.city.city}</h1>
		{#if cityContext(data.city)}
			<p class="text-muted mt-3">{cityContext(data.city)}</p>
		{/if}
	</header>

	{#if data.events.length === 0 && !data.cursor}
		<p class="text-muted py-12 text-center">No upcoming events in this city.</p>
	{:else}
		<EventList
			events={data.events}
			cursor={data.cursor}
			handles={data.handles}
			separateOngoing={false}
		/>
	{/if}
</div>
