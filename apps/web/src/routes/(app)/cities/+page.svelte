<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Icon, Popover } from '@atmo-dev/kit';
	import { CircleQuestionMark, MapPin } from '@sketchyicons/svelte';
	import { cityContext } from '#lib/cities.js';
	import CityPicker from '#lib/components/CityPicker.svelte';
	import EventList from '#lib/components/EventList.svelte';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	{#if data.mode === 'unavailable'}
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">Nearby</h1>
		<p class="text-base-600 dark:text-base-400 mt-6">Events are unavailable right now.</p>
		<a class="mt-4 inline-block underline" href={resolve('/(app)/cities')}>Try again</a>
	{:else if data.mode === 'choose'}
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">Choose a city</h1>
		{#key data.search}
			<CityPicker cities={data.cities} search={data.search} />
		{/key}
	{:else}
		<header class="mb-8">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex min-w-0 items-center gap-1">
					<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">
						{data.noLocalEvents ? 'Events near' : 'Events in'}
						{data.detected.city}
					</h1>
					{#if data.locationSource === 'ip'}
						<Popover aria-label="About this location" side="top" align="start" class="w-72 text-xs">
							{#snippet trigger({ props })}
								<button
									{...props}
									type="button"
									aria-label="About this location"
									class="text-accent-700 dark:text-accent-300 hover:text-accent-800 dark:hover:text-accent-200 inline-flex shrink-0 cursor-pointer items-center justify-center p-1.5"
								>
									<Icon img={CircleQuestionMark} size={20} />
								</button>
							{/snippet}
							<p>
								Your location is estimated from your internet connection. Learn more in our <a
									class="underline"
									href={resolve('/(app)/privacy')}>privacy policy</a
								>.
							</p>
						</Popover>
					{/if}
				</div>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<Button variant="secondary" href={`${resolve('/(app)/cities')}?choose=1`}>
					<Icon img={MapPin} size={16} />
					Change city
				</Button>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
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
