<script lang="ts">
	import { Badge } from '@foxui/core';
	import Map from '$lib/components/Map.svelte';
	import type { LocationData, GeoLocation } from './format';

	let {
		locationData,
		geoLocation
	}: {
		locationData: LocationData | null;
		geoLocation: GeoLocation | null;
	} = $props();

	let copied = $state(false);

	async function copyCoords() {
		if (!geoLocation) return;
		const text = `${geoLocation.lat.toFixed(5)}, ${geoLocation.lng.toFixed(5)}`;
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {}
	}
</script>

{#if geoLocation && locationData}
	<div class="mt-8 mb-8">
		<div class="mb-3 flex items-baseline gap-2">
			<p class="text-base-500 dark:text-base-400 text-xs font-semibold tracking-wider uppercase">
				Location:
			</p>
			<button
				type="button"
				onclick={copyCoords}
				class="ml-auto cursor-pointer transition-opacity active:opacity-60"
				title="Copy coordinates"
				aria-label="Copy coordinates"
			>
				<Badge size="sm" variant="secondary" class="font-mono">
					{copied
						? 'Copied!'
						: `${geoLocation.lat.toFixed(5)}, ${geoLocation.lng.toFixed(5)}`}
				</Badge>
			</button>
		</div>
		<div class="h-64 w-full overflow-hidden rounded-xl">
			<Map lat={geoLocation.lat} lng={geoLocation.lng} />
		</div>
		<p class="text-base-700 dark:text-base-200 mt-3 text-sm">{locationData.fullString}</p>
		<p class="text-base-500 dark:text-base-400 mt-1 text-xs">
			Open in
			<a
				href={geoLocation.googleMapsUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="text-base-700 dark:text-base-300 hover:underline"
			>
				Google Maps
			</a>
			|
			<a
				href={geoLocation.osmUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="text-base-700 dark:text-base-300 hover:underline"
			>
				OpenStreetMap
			</a>
		</p>
	</div>
{/if}
