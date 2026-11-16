<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import { EventView } from '@atmo-dev/kit/events';
	import { page } from '$app/state';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import { BETA_WARNING, BETA_WARNING_SHORT } from '../beta';
	import { singleEvent } from '../ids';
	import { createPrivateRsvpAdapter } from '../rsvp-adapter';
	import { GUEST_SCOPES, HOST_SCOPES } from '../scopes';
	import type { loadEventPage } from '../server/event-page';
	import { holdPrivateEmbeds } from '../embeds';
	import FindAgainOffer from './FindAgainOffer.svelte';
	import GuestList from './GuestList.svelte';
	import PrivateEventAccessNotice from './PrivateEventAccessNotice.svelte';

	// A private event's page: the event, and its guest list for its host.
	let { data }: { data: Awaited<ReturnType<typeof loadEventPage>> } = $props();
	holdPrivateEmbeds();

	// What the viewer has answered: the page's, until they answer here, so what follows from it
	// changes at once.
	let answered = $derived(data.view === 'event' ? (data.viewerRsvpStatus ?? null) : null);

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
	<!-- An event's space is its own, under the event's key. -->
	{@const adapter = createPrivateRsvpAdapter(
		singleEvent(data.actorDid, data.rkey),
		viewer,
		(status) => (answered = status)
	)}
	<!-- A private event has no public page to share, so the page offers no Bluesky post. -->
	<EventView {data} {adapter} {viewer} pageUrl={new URL(page.url.href)} share={false}>
		{#snippet extraActions()}
			{#if data.answersUnread}
				<p
					class="text-base-600 dark:text-base-400 text-sm"
					role="status"
					data-testid="answers-unread"
				>
					Some answers couldn't be read just now, so this may not show everyone's. Try again
					shortly.
				</p>
			{/if}
			{#if data.guests}
				<GuestList rkey={data.rkey} guests={data.guests} capped={data.guestsCapped} />
			{:else}
				<p class="text-base-600 dark:text-base-400 text-sm" data-testid="private-note">
					Private event. Only people the host added can see it.
					{#if !answered && !data.answersUnread}Answer to let the host know you saw it.{/if}
				</p>
				{#if answered}<FindAgainOffer />{/if}
			{/if}
			<p class="text-base-500 text-xs" data-testid="beta-notice">{BETA_WARNING_SHORT}</p>
		{/snippet}
	</EventView>
{:else}
	<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">Private event</h1>
		<p class="text-base-600 dark:text-base-400 mt-2 text-sm" data-testid="beta-notice">
			{BETA_WARNING}
		</p>
		{#if data.view === 'signed-out'}
			<p class="text-base-600 dark:text-base-400 mt-2">Sign in to see whether you were invited.</p>
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
