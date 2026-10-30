<script lang="ts">
	import { EventView, StarterPackButton } from '@atmo-dev/events-ui';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { createInAppAdapter } from '#lib/components/editor/adapter.js';
	import { page } from '$app/state';
	import { openStarterPack } from '#lib/starter-packs/packs.remote.js';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		canPostToBluesky: user.canPostToBluesky,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));
</script>

<EventView {data} {adapter} {viewer} pageUrl={new URL(page.url.href)}>
	{#snippet attendeeActions()}
		{#if data.starterPacksEnabled}
			{#key data.eventData.uri}
				<StarterPackButton
					eventUri={data.eventData.uri}
					openPack={async (eventUri) => (await openStarterPack({ eventUri })).url}
				/>
			{/key}
		{/if}
	{/snippet}
</EventView>
