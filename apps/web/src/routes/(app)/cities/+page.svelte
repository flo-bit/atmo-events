<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon } from '@atmo-dev/kit';
	import { MapPin } from '@sketchyicons/svelte';
	import { cityContext } from '#lib/cities.js';
	import CityPicker from '#lib/components/CityPicker.svelte';
	import EventList from '#lib/components/EventList.svelte';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	{#if data.mode === 'unavailable'}
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">Events nearby</h1>
		<p class="text-base-600 dark:text-base-400 mt-6">Events are unavailable right now.</p>
		<a class="mt-4 inline-block underline" href={resolve('/(app)/cities')}>Try again</a>
	{:else if data.mode === 'choose'}
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">Choose a city</h1>
		{#key data.search}
			<CityPicker cities={data.cities} search={data.search} />
		{/key}
	{:else}
		<header class="mb-8 flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">
					{data.noLocalEvents ? 'Events near' : 'Events in'}
					{data.detected.city}
				</h1>
				{#if cityContext(data.detected)}<p class="text-base-600 dark:text-base-400 mt-2">
						{cityContext(data.detected)}
					</p>{/if}
			</div>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				class="rounded-ui border-base-300 bg-base-100 dark:border-base-800 dark:bg-base-950 text-base-950 dark:text-base-50 hover:border-accent-400 inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-colors"
				href={`${resolve('/(app)/cities')}?choose=1`}
			>
				<Icon img={MapPin} size={16} />
				Change city
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</header>
		{#if data.noLocalEvents && data.shown}
			<h2 class="text-base-950 dark:text-base-50 mb-2 text-2xl font-bold">{data.shown.city}</h2>
			<p class="text-base-600 dark:text-base-400 mb-6">
				{cityContext(data.shown)} · {data.distanceKm} km away
			</p>
		{:else if !data.shown}
			<p class="text-base-600 dark:text-base-400">No nearby events.</p>
		{/if}
		{#if data.shown}
			<!-- Keep pending pagination from the previous city out of this list. -->
			{#key JSON.stringify([data.shown.city, data.shown.country, data.shown.region, data.cursor])}
				<EventList
					events={data.events}
					cursor={data.cursor}
					handles={data.handles}
					separateOngoing={false}
				/>
			{/key}
		{/if}
	{/if}
</div>
