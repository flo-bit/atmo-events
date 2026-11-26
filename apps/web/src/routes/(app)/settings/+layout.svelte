<script lang="ts">
	import { page } from '$app/state';
	import { Button, Icon } from '@atmo-dev/kit';
	import { ArrowLeft } from '@sketchyicons/svelte';
	let { children } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	{#if page.url.pathname !== '/settings' && page.url.pathname !== '/settings/'}
		<Button href="/settings" variant="ghost" class="mb-5 -ml-3 gap-2">
			<Icon img={ArrowLeft} size={18} />Settings
		</Button>
	{/if}
	{@render children()}
</div>
