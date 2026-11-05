<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import { EventView } from '@atmo-dev/kit/events';
	import { page } from '$app/state';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import GuestList from '#lib/private-events/components/GuestList.svelte';
	import PrivateEventAccessNotice from '#lib/private-events/components/PrivateEventAccessNotice.svelte';
	import { createPrivateRsvpAdapter } from '#lib/private-events/rsvp-adapter.js';
	import { GUEST_SCOPES, HOST_SCOPES } from '#lib/private-events/scopes.js';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		canPostToBluesky: false,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

{#if data.view === 'event'}
	{@const adapter = createPrivateRsvpAdapter(data.actorDid, data.rkey, viewer)}
	<EventView {data} {adapter} {viewer} pageUrl={new URL(page.url.href)}>
		{#snippet extraActions()}
			{#if data.guests}
				<GuestList rkey={data.rkey} guests={data.guests} />
			{:else}
				<p class="text-muted text-sm" data-testid="private-note">
					Private event. Only people the host added can see it.
					{#if !data.viewerRsvpStatus}Answer to let the host know you saw it.{/if}
				</p>
			{/if}
		{/snippet}
	</EventView>
{:else}
	<div class="mx-auto max-w-xl px-6 pt-12 pb-24">
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-semibold">Private event</h1>
		{#if data.view === 'signed-out'}
			<p class="text-muted mt-2">Sign in to see whether you were invited.</p>
			<Button class="mt-4" onclick={() => atProtoLoginModalState.show()}>Sign in</Button>
		{:else}
			<PrivateEventAccessNotice
				access={data.access}
				did={data.did}
				scopes={data.isHost ? HOST_SCOPES : GUEST_SCOPES}
				purpose={data.isHost
					? 'Your sign-in no longer lets atmo open your private events. Allow it again to see this one and its guest list.'
					: 'Private events are kept on the host’s server. atmo needs your permission to open them for you and save your answer in your own account.'}
				label={data.isHost ? 'Allow atmo again' : 'Allow atmo to open private events'}
				spacesServer={data.spacesServer}
			/>
		{/if}
	</div>
{/if}
