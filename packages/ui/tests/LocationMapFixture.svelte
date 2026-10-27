<script lang="ts">
	let { lat, lng }: { lat: number; lng: number } = $props();
</script>

<div role="img" aria-label={`Map at ${lat}, ${lng}`}></div>
