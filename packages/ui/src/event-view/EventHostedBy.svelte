<script lang="ts">
	import { Avatar } from '@atmo-dev/kit';
	import type { HostProfile } from '../contrail.js';

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
	<p class="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">Hosted By</p>
	<a
		href={hostUrl}
		class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
	>
		<Avatar
			src={hostProfile?.avatar}
			name={hostProfile?.displayName || hostProfile?.handle || did}
			class="size-8 shrink-0"
		/>
		<span class="truncate text-sm">
			{hostProfile?.displayName || hostProfile?.handle || did}
		</span>
	</a>
</div>

{#if speakers.length > 0}
	<div>
		<p class="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">Speakers</p>
		<div class="space-y-2">
			{#each speakers as speaker, i (speaker.id || i)}
				{#if speaker.handle}
					<a
						href="https://bsky.app/profile/{speaker.handle}"
						target="_blank"
						rel="noopener noreferrer"
						class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
					>
						<Avatar src={speaker.avatar} name={speaker.name} class="size-8 shrink-0" />
						<span class="truncate text-sm">{speaker.name}</span>
					</a>
				{:else}
					<div class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium">
						<Avatar name={speaker.name} class="size-8 shrink-0" />
						<span class="truncate text-sm">{speaker.name}</span>
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}
