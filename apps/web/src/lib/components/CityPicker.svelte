<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { cityContext, type CityScope } from '#lib/cities.js';

	let { cities, search = '' }: { cities: CityScope[]; search?: string } = $props();
	const id = $props.id();
	let query = $state(untrack(() => search));
	let suggestions = $state<CityScope[]>(untrack(() => cities.slice(0, 8)));
	let loading = $state(false);
	let failed = $state(false);
	let open = $state(true);
	let active = $state(-1);
	let retry = $state(0);
	let list: HTMLUListElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();

	$effect(() => {
		const term = query.trim();
		const attempt = retry;
		active = -1;
		failed = false;
		if (term === search.trim() && !attempt) {
			suggestions = cities.slice(0, 8);
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
					{
						signal: controller.signal
					}
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

	function select(index: number) {
		list?.querySelector<HTMLAnchorElement>(`[data-option="${index}"]`)?.click();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			open = false;
			active = -1;
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			open = true;
			if (!suggestions.length) return;
			active =
				event.key === 'ArrowDown'
					? (active + 1) % suggestions.length
					: (active <= 0 ? suggestions.length : active) - 1;
		} else if (event.key === 'Enter' && open && suggestions.length && !loading) {
			event.preventDefault();
			select(Math.max(active, 0));
		}
	}
</script>

<form
	action={resolve('/(app)/cities')}
	class="relative mt-6"
	onsubmit={(event) => {
		event.preventDefault();
		input?.focus();
		open = true;
		retry++;
	}}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
	}}
>
	<input type="hidden" name="choose" value="1" />
	<label class="sr-only" for={`${id}-input`}>City</label>
	<input
		id={`${id}-input`}
		bind:this={input}
		name="q"
		bind:value={query}
		placeholder="Search cities"
		maxlength="256"
		autocomplete="off"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={`${id}-suggestions`}
		aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
		oninput={() => {
			open = true;
			active = -1;
		}}
		onfocus={() => {
			open = true;
		}}
		onkeydown={keydown}
		class="border-base-300 bg-base-100 dark:border-base-800 dark:bg-base-950 text-base-950 dark:text-base-50 rounded-ui w-full border px-4 py-3"
	/>
	<noscript><button class="mt-2 underline" type="submit">Search</button></noscript>
	<ul
		id={`${id}-suggestions`}
		bind:this={list}
		role="listbox"
		aria-label="Cities"
		aria-busy={loading}
		hidden={!open || !suggestions.length}
		class="border-base-300 dark:border-base-800 rounded-ui mt-2 overflow-hidden border"
	>
		{#each suggestions as city, index (JSON.stringify([city.city, city.country, city.region]))}
			<li role="presentation">
				<!-- Loading a selection saves it: never preload on hover. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					id={`${id}-option-${index}`}
					role="option"
					aria-selected={active === index}
					data-option={index}
					data-sveltekit-preload-data="off"
					href={`${resolve('/(app)/cities')}?${new URLSearchParams({ city: city.city, country: city.country, region: city.region })}`}
					onfocus={() => {
						active = index;
					}}
					class="text-base-950 dark:text-base-50 hover:bg-base-100 dark:hover:bg-base-800 block px-4 py-3 break-words"
					class:bg-base-100={active === index}
					class:dark:bg-base-800={active === index}
				>
					<span class="font-medium">{city.city}</span>
					{#if cityContext(city)}<span class="text-base-600 dark:text-base-400 ml-2 text-sm"
							>{cityContext(city)}</span
						>{/if}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ul>
	{#if open}
		<div role="status" class="text-base-600 dark:text-base-400 mt-3 text-sm">
			{#if loading}Searching…
			{:else if failed}Couldn't load cities. <button class="underline" type="submit">Retry</button>
			{:else if !suggestions.length}No cities found.{/if}
		</div>
	{/if}
</form>
