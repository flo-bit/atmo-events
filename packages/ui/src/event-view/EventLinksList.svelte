<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { Link } from '@sketchyicons/svelte';
	let { uris = [] }: { uris?: Array<{ uri: string; name?: string }> } = $props();
</script>

{#if uris.length}
	<div>
		<p class="text-muted mb-3 text-xs font-medium">Links</p>
		<div class="space-y-3">
			{#each uris as link (link.name + link.uri)}
				<a
					href={link.uri}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted hover:text-action flex items-center gap-2 rounded-sm text-sm transition-colors"
					><Icon img={Link} size={15} /><span class="truncate"
						>{link.name || link.uri.replace(/^https?:\/\//, '')}</span
					></a
				>
			{/each}
		</div>
	</div>
{/if}
