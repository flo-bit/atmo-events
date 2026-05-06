<script lang="ts">
	import { Avatar as FoxAvatar } from '@foxui/core';
	import type { HostProfile } from '$lib/contrail';

	type Speaker = { id?: string; handle?: string; name: string; avatar?: string };

	let {
		hostProfile,
		hostUrl,
		did,
		speakers = []
	}: {
		hostProfile: HostProfile | null | undefined;
		hostUrl: string;
		did: string;
		speakers?: Speaker[];
	} = $props();
</script>

<div>
	<p class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase">
		Hosted By
	</p>
	<a
		href={hostUrl}
		class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
	>
		<FoxAvatar
			src={hostProfile?.avatar}
			alt={hostProfile?.displayName || hostProfile?.handle || did}
			class="size-8 shrink-0"
		/>
		<span class="truncate text-sm">
			{hostProfile?.displayName || hostProfile?.handle || did}
		</span>
	</a>
</div>

{#if speakers.length > 0}
	<div>
		<p class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase">
			Speakers
		</p>
		<div class="space-y-2">
			{#each speakers as speaker, i (speaker.id || i)}
				{#if speaker.handle}
					<a
						href="/p/{speaker.handle}"
						class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
					>
						<FoxAvatar src={speaker.avatar} alt={speaker.name} class="size-8 shrink-0" />
						<span class="truncate text-sm">{speaker.name}</span>
					</a>
				{:else}
					<div class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium">
						<FoxAvatar alt={speaker.name} class="size-8 shrink-0" />
						<span class="truncate text-sm">{speaker.name}</span>
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}
