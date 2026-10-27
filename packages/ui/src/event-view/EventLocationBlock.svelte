<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { MapPin } from '@sketchyicons/svelte';
	import type { LocationData } from './format';
	let { locationData }: { locationData: LocationData | null } = $props();
</script>

{#if locationData}
	<a
		href={locationData.googleMapsUrl}
		target="_blank"
		rel="noopener noreferrer"
		class="rounded-ui mb-6 flex items-center gap-4 transition-opacity hover:opacity-80"
	>
		<div
			class="rounded-ui bg-recess text-muted flex size-12 shrink-0 items-center justify-center [box-shadow:var(--ui-recess-shadow)]"
		>
			<Icon img={MapPin} size={22} />
		</div>
		<div>
			{#if locationData.name}<p class="text-ink font-semibold">{locationData.name}</p>
				<p class="text-muted text-sm">{locationData.shortAddress}</p>{:else}<p
					class="text-ink font-semibold"
				>
					{locationData.shortAddress}
				</p>{/if}
		</div>
	</a>
{/if}
