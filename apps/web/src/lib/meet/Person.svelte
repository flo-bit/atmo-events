<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Avatar, type ProfileData } from '@atmo-dev/kit';
	import { meetingProfile } from './profile';
	let { did, initial }: { did: string; initial?: ProfileData | null } = $props();
	let loaded = $state<ProfileData>();
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	$effect(() => {
		const actor = did;
		loaded = undefined;
		if (!mounted || initial) return;
		let disposed = false;
		void meetingProfile(actor).then((result) => {
			if (!disposed) loaded = result;
		});
		return () => {
			disposed = true;
		};
	});
	let profile = $derived(initial ?? (loaded?.did === did ? loaded : undefined));
</script>

<a href={resolve('/(app)/p/[actor]', { actor: did })} class="flex min-w-0 items-center gap-3">
	<Avatar src={profile?.avatar} name={profile?.displayName || profile?.handle || did} size={44} />
	<div class="min-w-0">
		<p class="truncate font-medium">{profile?.displayName || profile?.handle || did}</p>
		{#if profile?.handle}<p class="text-muted truncate text-sm">@{profile.handle}</p>{/if}
	</div>
</a>
