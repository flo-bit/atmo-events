<script lang="ts">
	import { resolve } from '$app/paths';
	import { cityContext, citySearchParams, type City } from '#lib/cities.js';

	let { data } = $props();
</script>

{#snippet cityList(cities: City[])}
	<ol class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		{#each cities as city (JSON.stringify([city.city, city.country, city.region]))}
			<li>
				<!-- The path is resolved; its scope query string must be appended separately. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={`${resolve('/(app)/cities/[city]', { city: encodeURIComponent(city.city) })}?${citySearchParams(city)}`}
					class="rounded-ui border-line bg-recess text-ink hover:border-accent-400 dark:hover:border-accent-600 flex h-full items-center justify-between gap-4 border p-4 inset-shadow-sm transition-colors"
				>
					<div class="min-w-0">
						<span class="font-medium break-words">{city.city}</span>
						{#if cityContext(city)}
							<p class="text-muted mt-1 text-sm break-words">{cityContext(city)}</p>
						{/if}
					</div>
					<p class="text-muted shrink-0 text-right text-xs tabular-nums">
						<span class="text-ink block text-lg font-medium">{city.count}</span>
						upcoming {city.count === 1 ? 'event' : 'events'}
					</p>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ol>
{/snippet}

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-8">
		<h1 class="text-ink text-3xl font-bold sm:text-4xl">Browse Cities</h1>
		<p class="text-muted mt-3 text-lg">Discover cities with upcoming events.</p>
	</div>

	{#if data.cities === null}
		<p class="text-muted">Cities are unavailable right now. Please try again later.</p>
	{:else if data.cities.length === 0}
		<p class="text-muted">No upcoming events with a city yet.</p>
	{:else}
		{#if data.nearby?.length || data.inCountry?.length}
			<p class="text-muted mb-6 text-sm">
				Suggestions use your approximate IP location and may not reflect your actual location.
			</p>
		{/if}
		{#if data.nearby?.length}
			<section class="mb-10">
				<h2 class="text-ink mb-2 text-2xl font-bold">Nearby cities</h2>
				<p class="text-muted mb-4">
					Cities within approximately 500 km, ranked by upcoming events.
				</p>
				{@render cityList(data.nearby)}
			</section>
		{/if}
		{#if data.inCountry?.length}
			<section class="mb-10">
				<h2 class="text-ink mb-2 text-2xl font-bold">More cities in your country</h2>
				<p class="text-muted mb-4">Distance isn't available for these cities.</p>
				{@render cityList(data.inCountry)}
			</section>
		{/if}
		<section>
			<h2 class="text-ink mb-4 text-2xl font-bold">Popular worldwide</h2>
			{@render cityList(data.cities)}
		</section>
	{/if}
</div>
