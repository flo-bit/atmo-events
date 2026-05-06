<script lang="ts">
	import type { EventTheme } from './theme.js';
	import Blobs from './themes/Blobs.svelte';
	import Stars from './themes/Stars.svelte';
	import Matrix from './themes/Matrix.svelte';
	import Fireflies from './themes/Fireflies.svelte';
	import Butterflies from './themes/Butterflies.svelte';
	import Kaleidoscope from './themes/Kaleidoscope.svelte';

	let {
		theme
	}: {
		theme: EventTheme;
	} = $props();

	let key = $derived(`${theme.name}-${theme.accentColor}-${theme.baseColor}`);
</script>

{#key key}
	{#if theme.name === 'blobs'}
		<Blobs />
	{:else if theme.name === 'warp'}
		<Stars />
	{:else if theme.name === 'matrix'}
		<Matrix />
	{:else if theme.name === 'fireflies'}
		<Fireflies />
	{:else if theme.name === 'butterflies'}
		<Butterflies />
	{:else if theme.name === 'kaleidoscope'}
		<Kaleidoscope />
	{/if}
{/key}
