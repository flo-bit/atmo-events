<script lang="ts">
	import { Avatar, cn } from '@foxui/core';
	import { sanitize } from '$lib/cal/sanitize';
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
	<div class={cn('mx-auto max-w-full sm:max-w-2xl sm:py-6', className)}>
		<div>
			{#if profile.banner}
				<img
					class="border-base-800 aspect-3/1 w-full border-b object-cover sm:rounded-xl sm:border"
					src={profile.banner}
					alt=""
				/>
			{:else}
				<div class="aspect-8/1 w-full"></div>
			{/if}
		</div>
		<div
			class={cn(
				profile.banner ? '-mt-11' : '-mt-8',
				'flex max-w-full items-end space-x-5 px-4 sm:-mt-16 sm:px-6 lg:px-8'
			)}
		>
			<Avatar
				src={profile.avatar}
				class="border-base-50 dark:border-base-800 size-24 border-2 sm:size-32"
			/>
			<div
				class="flex min-w-0 flex-1 flex-row sm:flex-row sm:items-center sm:justify-end sm:space-x-6 sm:pb-1"
			>
				<div
					class={cn(
						profile.banner ? 'mt-4 sm:mt-0' : '-mt-18 sm:-mt-26',
						'flex max-w-full min-w-0 flex-1 flex-col items-baseline'
					)}
				>
					<h1
						class="text-base-900 dark:text-base-100 max-w-full truncate text-lg font-bold sm:text-xl"
					>
						{profile.displayName || profile.handle}
					</h1>
					<div class="text-base-900 dark:text-base-400 truncate text-xs sm:text-sm">
						{profile.handle}
					</div>
				</div>
			</div>

			{#if actions}
				{@render actions()}
			{/if}
		</div>

		<div class="text-base-800 dark:text-base-200 px-4 py-4 text-xs sm:px-6 sm:text-sm lg:px-8">
			{@html sanitize(profile.description?.replaceAll('\n', '<br/>') ?? '')}
		</div>
	</div>
{/if}
