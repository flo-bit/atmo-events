<script lang="ts">
	import { Button } from '@foxui/core';
	import AtmosphereTicketsIcon from './AtmosphereTicketsIcon.svelte';
	import { isAtmosphereTicketsUrlForEvent, sanitizeWebUrl } from './tickets.js';

	let {
		url,
		eventUri,
		unavailable = false
	}: { url?: string; eventUri: string; unavailable?: boolean } = $props();
	let safeUrl = $derived.by(() => {
		const href = sanitizeWebUrl(url);
		return href && isAtmosphereTicketsUrlForEvent(href, eventUri) ? href : null;
	});

	function retry() {
		if (typeof window !== 'undefined') window.location.reload();
	}
</script>

{#if safeUrl}
	<div
		class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<p class="text-base-900 dark:text-base-50 text-sm font-semibold">This is a ticketed event</p>
		<Button
			href={safeUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="w-full shrink-0 sm:w-auto"
		>
			<AtmosphereTicketsIcon class="size-5 shrink-0" />
			Buy tickets
			<span class="sr-only">(opens in a new tab)</span>
		</Button>
	</div>
{:else if unavailable}
	<div
		class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			<p class="text-base-900 dark:text-base-50 text-sm font-semibold">This is a ticketed event</p>
			<p class="text-base-600 dark:text-base-400 mt-1 text-sm">
				Ticket information is unavailable right now.
			</p>
		</div>
		<Button onclick={retry} variant="secondary" class="w-full shrink-0 sm:w-auto">Try again</Button>
	</div>
{/if}
