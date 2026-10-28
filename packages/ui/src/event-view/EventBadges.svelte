<script lang="ts">
	import { Badge } from '@atmo-dev/kit';
	import { getModeLabel } from './format';

	let { mode, isOngoing }: { mode?: string; isOngoing: boolean } = $props();
</script>

{#if mode || isOngoing}
	<div class="mb-8 flex items-center gap-2">
		{#if isOngoing}
			<Badge>
				<span class="bg-accent-500 mr-1 inline-block size-1.5 animate-pulse rounded-full"></span>
				Live
			</Badge>
		{/if}
		{#if mode}
			<Badge variant="outline">{getModeLabel(mode)}</Badge>
		{/if}
	</div>
{/if}
