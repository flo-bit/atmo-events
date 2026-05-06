<script lang="ts">
	// @ts-nocheck
	import { tick } from 'svelte';

	let {
		value = $bindable('')
	}: {
		value: string;
	} = $props();

	let isOpen = $state(false);
	let search = $state('');
	let listEl: HTMLDivElement | undefined = $state(undefined);
	let searchEl: HTMLInputElement | undefined = $state(undefined);

	// Get all IANA timezones
	const allTimezones = Intl.supportedValuesOf('timeZone');

	function getOffset(tz: string): string {
		try {
			const fmt = new Intl.DateTimeFormat('en', {
				timeZone: tz,
				timeZoneName: 'shortOffset'
			});
			const parts = fmt.formatToParts(new Date());
			const tzPart = parts.find((p) => p.type === 'timeZoneName');
			return tzPart?.value ?? '';
		} catch {
			return '';
		}
	}

	function getCityName(tz: string): string {
		const parts = tz.split('/');
		return (parts[parts.length - 1] || tz).replace(/_/g, ' ');
	}

	let displayOffset = $derived(getOffset(value));
	let displayCity = $derived(getCityName(value));

	let filtered = $derived.by(() => {
		if (!search.trim()) return allTimezones;
		const q = search.toLowerCase();
		return allTimezones.filter((tz) => {
			const city = getCityName(tz).toLowerCase();
			const offset = getOffset(tz).toLowerCase();
			return tz.toLowerCase().includes(q) || city.includes(q) || offset.includes(q);
		});
	});

	function selectTimezone(tz: string) {
		value = tz;
		isOpen = false;
		search = '';
	}

	$effect(() => {
		if (isOpen) {
			tick().then(() => {
				searchEl?.focus();
				if (listEl) {
					const selected = listEl.querySelector('[data-selected]');
					if (selected) {
						selected.scrollIntoView({ block: 'center' });
					}
				}
			});
		}
	});
</script>

<div class="relative">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="border-base-300 bg-base-100 text-base-900 dark:border-base-700 dark:bg-base-800 dark:text-base-100 flex h-full shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-5 py-2 text-xs transition-colors"
		onclick={() => (isOpen = !isOpen)}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			class="text-base-400 dark:text-base-500 size-4"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.794 1.708-5.282"
			/>
		</svg>
		<div class="flex flex-col items-center gap-0.5 leading-tight">
			<span class="text-base-500 dark:text-base-400">{displayOffset}</span>
			<span>{displayCity}</span>
		</div>
	</div>

	{#if isOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-40" onclick={() => { isOpen = false; search = ''; }} onkeydown={(e) => { if (e.key === 'Escape') { isOpen = false; search = ''; } }}></div>
		<div class="border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-900 absolute right-0 z-50 mt-2 w-64 rounded-2xl border p-2 shadow-lg">
			<input
				bind:this={searchEl}
				bind:value={search}
				type="text"
				placeholder="Search timezone..."
				class="border-base-300 bg-base-100 text-base-900 dark:border-base-700 dark:bg-base-800 dark:text-base-100 mb-2 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:focus:border-accent-400"
				onkeydown={(e) => { if (e.key === 'Escape') { isOpen = false; search = ''; } }}
			/>
			<div bind:this={listEl} class="max-h-60 overflow-y-auto">
				{#each filtered as tz (tz)}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors
							{value === tz
							? 'bg-accent-100 dark:bg-accent-900 font-medium text-accent-900 dark:text-accent-100'
							: 'text-base-700 hover:bg-base-200 dark:text-base-300 dark:hover:bg-base-700'}"
						data-selected={value === tz ? '' : undefined}
						onclick={() => selectTimezone(tz)}
					>
						<span>{getCityName(tz)}</span>
						<span class="text-base-400 dark:text-base-500 text-xs">{getOffset(tz)}</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<p class="text-base-400 dark:text-base-500 px-3 py-2 text-sm">No results</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
