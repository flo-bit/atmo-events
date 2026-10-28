<script lang="ts">
	import { Avatar, cn } from '@atmo-dev/kit';
	import { sanitize } from '#lib/cal/sanitize.js';
	import type { Snippet } from 'svelte';

	let {
		profile,
		actions,
		class: className
	}: {
		profile: {
			banner?: string;
			avatar?: string;
			displayName?: string;
			handle?: string;
			description?: string;
		};
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

{#if profile}
	<section class={cn('mb-10 min-w-0 pt-6 sm:pt-8', className)}>
		{#if profile.banner}
			<img class="rounded-panel mb-6 aspect-3/1 w-full object-cover" src={profile.banner} alt="" />
		{/if}
		<div class="flex flex-wrap items-center gap-5">
			<Avatar
				name={profile.displayName || profile.handle || 'Account'}
				size={96}
				src={profile.avatar}
				class="size-20 shrink-0 sm:size-24"
			/>
			<div class="min-w-0 flex-1">
				<h1 class="text-ink truncate text-2xl font-semibold tracking-tight sm:text-3xl">
					{profile.displayName || profile.handle}
				</h1>
				{#if profile.handle}
					<p class="text-muted mt-1 truncate text-sm">@{profile.handle}</p>
				{/if}
			</div>
			{@render actions?.()}
		</div>
		{#if profile.description}
			<div class="text-muted mt-5 text-sm leading-relaxed">
				{@html sanitize(profile.description.replaceAll('\n', '<br/>'))}
			</div>
		{/if}
	</section>
{/if}
