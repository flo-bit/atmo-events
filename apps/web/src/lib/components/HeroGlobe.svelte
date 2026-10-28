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
		--paper: var(--ui-page);
		--ink: var(--ui-ink);
		--accent: var(--ui-action);
		--muted: var(--ui-muted);
		--line: var(--ui-line);
		--popup-shadow: var(--ui-shadow);
		--font-sans: var(--atmo-font-sans);
	}
</style>
