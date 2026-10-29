<script lang="ts">
	import { resolve } from '$app/paths';
	import { cityContext, citySearchParams } from '#lib/cities.js';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-8">
		<h1 class="text-ink text-3xl font-bold sm:text-4xl">Browse Cities</h1>
		<p class="text-muted mt-3 text-lg">The cities with the most upcoming events.</p>
	</div>

	{#if data.cities === null}
		<p class="text-muted">Cities are unavailable right now. Please try again later.</p>
	{:else if data.cities.length === 0}
		<p class="text-muted">No upcoming events with a city yet.</p>
	{:else}
		<ol class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each data.cities as city (JSON.stringify([city.city, city.country, city.region]))}
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
	{/if}
</div>
