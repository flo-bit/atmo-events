<script lang="ts">
	import { Badge } from '@foxui/core';
	import { getModeColor, getModeLabel } from './format';

	let { mode, isOngoing }: { mode?: string; isOngoing: boolean } = $props();
</script>

{#if mode || isOngoing}
	<div class="mb-8 flex items-center gap-2">
		{#if isOngoing}
			<Badge size="md" variant="primary">
				<span class="bg-accent-500 mr-1 inline-block size-1.5 animate-pulse rounded-full"></span>
				Live
			</Badge>
		{/if}
		{#if mode}
			<Badge size="md" variant="primary" class={getModeColor(mode)}>{getModeLabel(mode)}</Badge>
		{/if}
	</div>
{/if}
