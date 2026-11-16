<script lang="ts">
	import Globe from './globe/Globe.svelte';
</script>

<div class="hero-globe">
	<Globe interactive={false} />
</div>

<style>
	.hero-globe {
		position: relative;
		width: 100%;
		max-width: 30rem;
		margin-inline: auto;
		/* Use the host theme without changing the globe's pen work or geometry. */
		--paper: light-dark(var(--base-50), var(--base-925));
		--ink: light-dark(var(--base-950), var(--base-50));
		--accent: light-dark(var(--accent-700), var(--accent-300));
		--muted: light-dark(var(--base-600), var(--base-400));
		--line: light-dark(var(--base-300), color-mix(in srgb, var(--base-800) 80%, var(--base-950)));
		--popup-shadow: light-dark(color-mix(in srgb, var(--base-950) 8%, transparent), #0006);
		--font-sans: var(--atmo-font-sans);
	}
</style>
