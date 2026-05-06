<script lang="ts">
	import { MapLibre, Projection, Marker, AttributionControl } from 'svelte-maplibre-gl';
	import maplibregl from 'maplibre-gl';

	let { lat, lng, zoom = 11 }: { lat: number; lng: number; zoom?: number } = $props();

	let map: maplibregl.Map | undefined = $state();
</script>

<MapLibre
	bind:map
	class="h-full w-full overflow-hidden rounded-xl"
	style="https://tiles.openfreemap.org/styles/liberty"
	{zoom}
	center={[lng, lat]}
	attributionControl={false}
>
	<AttributionControl position="bottom-left" compact={false} />
	<Projection type="globe" />
	<Marker lnglat={[lng, lat]}>
		{#snippet content()}
			<div class="from-accent-400 size-10 rounded-full bg-radial via-transparent p-3">
				<div class="bg-accent-500 size-4 rounded-full ring-2 ring-white"></div>
			</div>
		{/snippet}
	</Marker>
</MapLibre>
