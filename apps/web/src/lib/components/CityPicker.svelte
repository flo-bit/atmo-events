<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { cityContext, type CityScope } from '#lib/cities.js';

	let { cities, search = '' }: { cities: CityScope[]; search?: string } = $props();
	const id = $props.id();
	let query = $state(untrack(() => search));
	let suggestions = $state<CityScope[]>(untrack(() => cities));
	let loading = $state(false);
	let failed = $state(false);
	let retry = $state(0);

	$effect(() => {
		const term = query.trim();
		const attempt = retry;
		failed = false;
		if (term === search.trim() && !attempt) {
			suggestions = cities;
			loading = false;
			return;
		}
		suggestions = [];
		loading = true;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(
					`${resolve('/api/cities')}?${new URLSearchParams({ q: term })}`,
					{ signal: controller.signal }
				);
				if (!response.ok) throw new Error('City search failed');
				const result: { cities: CityScope[] } = await response.json();
				if (!controller.signal.aborted) suggestions = result.cities;
			} catch {
				if (!controller.signal.aborted) failed = true;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});
</script>

<form
	action={resolve('/(app)/cities')}
	class="mt-6"
	onsubmit={(event) => {
		event.preventDefault();
		retry++;
	}}
>
	<input type="hidden" name="choose" value="1" />
	<label class="sr-only" for={`${id}-input`}>City</label>
	<input
		id={`${id}-input`}
		name="q"
		bind:value={query}
		placeholder="Search cities"
		maxlength="256"
		autocomplete="off"
		aria-controls={`${id}-cities`}
		class="border-base-300 bg-base-100 dark:border-base-800 dark:bg-base-950 text-base-950 dark:text-base-50 rounded-ui w-full border px-4 py-2"
	/>
	<noscript><button class="mt-2 underline" type="submit">Search</button></noscript>
</form>
<ul
	id={`${id}-cities`}
	aria-label="Cities"
	aria-busy={loading}
	class="mt-6 grid gap-3 sm:grid-cols-2"
>
	{#each suggestions as city (JSON.stringify([city.city, city.country, city.region]))}
		<li>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={`${resolve('/(app)/cities')}?${new URLSearchParams({ city: city.city, country: city.country, region: city.region })}`}
				data-sveltekit-preload-data="off"
				class="border-base-300 bg-base-100 dark:border-base-800 dark:bg-base-950 text-base-950 dark:text-base-50 hover:border-accent-400 rounded-ui block h-full border p-4"
			>
				<span class="font-medium break-words">{city.city}</span>
				{#if cityContext(city)}<span
						class="text-base-600 dark:text-base-400 mt-1 block text-sm break-words"
						>{cityContext(city)}</span
					>{/if}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</li>
	{/each}
</ul>
<div role="status" class="text-base-600 dark:text-base-400 mt-3 text-sm">
	{#if loading}Searching…
	{:else if failed}Couldn't load cities. <button
			class="underline"
			type="button"
			onclick={() => retry++}>Retry</button
		>
	{:else if !suggestions.length}No cities found.{/if}
</div>
