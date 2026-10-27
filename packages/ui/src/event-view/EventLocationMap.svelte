<script lang="ts">
	import { Badge } from '@atmo-dev/kit';
	import Map from '../Map.svelte';
	import type { GeoLocation } from './locations.js';

	let { geoLocation }: { geoLocation: GeoLocation | null } = $props();

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

{#if geoLocation}
	<div class="mt-8 mb-8">
		<div class="mb-3 flex items-baseline gap-2">
			<p class="text-muted text-xs font-semibold tracking-wider uppercase">Location:</p>
			<button
				type="button"
				onclick={copyCoords}
				class="ml-auto cursor-pointer transition-opacity active:opacity-60"
				title="Copy coordinates"
				aria-label="Copy coordinates"
			>
				<Badge variant="outline" class="font-mono">
					{copied ? 'Copied!' : `${geoLocation.lat.toFixed(5)}, ${geoLocation.lng.toFixed(5)}`}
				</Badge>
			</button>
		</div>
		<div class="h-64 w-full overflow-hidden rounded-xl">
			<Map lat={geoLocation.lat} lng={geoLocation.lng} />
		</div>
		<p class="text-base-700 dark:text-base-200 mt-3 text-sm [overflow-wrap:anywhere]">
			{geoLocation.label}
		</p>
		<p class="text-muted mt-1 text-xs">
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
