<script lang="ts">
	import LinksSection from '../src/editor/LinksSection.svelte';
	import type { EditorAdapter, EditorViewer } from '../src/editor/adapter.js';
	let {
		adapter,
		viewer,
		initialLinks = []
	}: {
		adapter: EditorAdapter;
		viewer: EditorViewer;
		initialLinks?: Array<{ uri: string; name: string }>;
	} = $props();
	// svelte-ignore state_referenced_locally
	let links = $state(initialLinks.map((link) => ({ ...link })));
	let submits = $state(0);
</script>

<div class="atmo-theme mx-auto max-w-lg p-6">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			submits++;
		}}
	>
		<LinksSection bind:links {adapter} {viewer} />
	</form>
	<output class="sr-only" aria-label="Event links">{JSON.stringify(links)}</output>
	<output class="sr-only" aria-label="Form submits">{submits}</output>
</div>
