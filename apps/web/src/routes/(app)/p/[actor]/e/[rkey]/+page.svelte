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
		preferredSocialClient: user.preferredSocialClient,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));
</script>

<EventView {data} {adapter} {viewer} pageUrl={new URL(page.url.href)}>
	{#snippet attendeeActions({ goingCount, interestedCount })}
		{#if data.starterPacksEnabled && goingCount + interestedCount > 5}
			{#key data.eventData.uri}
				<StarterPackButton
					eventUri={data.eventData.uri}
					socialClient={user.preferredSocialClient}
					openPack={async (eventUri) => (await openStarterPack({ eventUri })).url}
				/>
			{/key}
		{/if}
	{/snippet}
</EventView>
