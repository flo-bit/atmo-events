<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<style>
		html, body { height: 100%; margin: 0; }
	</style>
</svelte:head>

{@render children()}
