<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon } from '@atmo-dev/kit';
	import { MapPin } from '@sketchyicons/svelte';
	import { cityContext } from '#lib/cities.js';
	import EventList from '#lib/components/EventList.svelte';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	{#if data.mode === 'unavailable'}
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">Events nearby</h1>
		<p class="text-base-600 dark:text-base-400 mt-6">
			Events are unavailable right now. Please try again shortly.
		</p>
		<a class="mt-4 inline-block underline" href={resolve('/(app)/cities')}>Try again</a>
	{:else if data.mode === 'choose'}
		<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">Choose a city</h1>
		<form action={resolve('/(app)/cities')} class="mt-6 flex gap-2">
			<input type="hidden" name="choose" value="1" />
			<label class="sr-only" for="city-search">City</label>
			<input
				id="city-search"
				name="q"
				value={data.search}
				placeholder="Search cities"
				maxlength="256"
				class="border-base-300 bg-base-100 dark:border-base-800 dark:bg-base-950 text-base-950 dark:text-base-50 rounded-ui min-w-0 flex-1 border px-4 py-2"
			/>
			<button class="bg-accent-600 rounded-ui px-4 py-2 font-medium text-white" type="submit"
				>Search</button
			>
		</form>
		{#if data.cities.length}
			<ul class="mt-6 grid gap-3 sm:grid-cols-2">
				{#each data.cities as city (JSON.stringify([city.city, city.country, city.region]))}
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={`${resolve('/(app)/cities')}?${new URLSearchParams({ city: city.city, country: city.country, region: city.region })}`}
							data-sveltekit-preload-data="off"
							class="border-base-300 bg-base-100 dark:border-base-800 dark:bg-base-950 text-base-950 dark:text-base-50 hover:border-accent-400 rounded-ui block h-full border p-4"
						>
							<span class="font-medium break-words">{city.city}</span>
							{#if cityContext(city)}<span
									class="text-base-600 dark:text-base-400 mt-1 block text-sm"
									>{cityContext(city)}</span
								>{/if}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-base-600 dark:text-base-400 mt-6">No cities found.</p>
		{/if}
	{:else}
		<header class="mb-8 flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="text-base-950 dark:text-base-50 text-3xl font-bold sm:text-4xl">
					Events in {data.detected.city}
				</h1>
				{#if cityContext(data.detected)}<p class="text-base-600 dark:text-base-400 mt-2">
						{cityContext(data.detected)}
					</p>{/if}
				<p class="text-base-600 dark:text-base-400 mt-2 text-sm">
					{data.locationSource === 'ip'
						? 'Based on approximate IP location.'
						: 'Using your selected city.'}
				</p>
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
		<p class="text-base-600 dark:text-base-400 mb-6 text-sm">
			Upcoming in-person and hybrid events. Nearby suggestions are within {data.radiusKm} km.
			{#if data.locationSource === 'selected'}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="underline"
					data-sveltekit-preload-data="off"
					href={`${resolve('/(app)/cities')}?locate=1`}>Use approximate IP location</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</p>
		{#if data.noLocalEvents}
			<p class="text-base-600 dark:text-base-400 mb-6">No upcoming events matched this location.</p>
			{#if data.shown}
				<h2 class="text-base-950 dark:text-base-50 mb-2 text-2xl font-bold">
					Events in {data.shown.city}
				</h2>
				<p class="text-base-600 dark:text-base-400 mb-6">
					{cityContext(data.shown)} · About {data.distanceKm} km away
				</p>
			{:else}
				<p class="text-base-600 dark:text-base-400 mb-6">
					No nearby results found. Try another city.
				</p>
			{/if}
		{/if}
		{#if data.shown && !data.events.length && data.cursor}
			<p class="text-base-600 dark:text-base-400 mb-6">
				Some listings are no longer available. Load more to check the remaining events.
			</p>
		{/if}
		{#if data.shown}
			<!-- Remount on a new city/snapshot so an in-flight load-more response
			     from the previous selection cannot append to the new list. -->
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
	<p class="text-base-600 dark:text-base-400 mt-8 text-sm">
		Listings refresh periodically after events reach our index.
	</p>
</div>
