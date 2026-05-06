<script lang="ts">
	let { uris = [] }: { uris?: Array<{ uri: string; name?: string }> } = $props();
</script>

{#if uris.length > 0}
	<div>
		<p class="text-base-500 dark:text-base-400 mb-4 text-xs font-semibold tracking-wider uppercase">
			Links
		</p>
		<div class="space-y-3">
			{#each uris as link (link.name + link.uri)}
				<a
					href={link.uri}
					target="_blank"
					rel="noopener noreferrer"
					class="text-base-700 dark:text-base-300 hover:text-base-900 dark:hover:text-base-100 flex items-center gap-1.5 text-sm transition-colors"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-3.5 shrink-0"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
						/>
					</svg>
					<span class="truncate">{link.name || link.uri.replace(/^https?:\/\//, '')}</span>
				</a>
			{/each}
		</div>
	</div>
{/if}
