<script lang="ts">
	import { EventCard } from '@atmo-dev/kit/events';
	import { resolve } from '$app/paths';
	import { BETA_WARNING } from '#lib/private-events/beta.js';
	import PrivateEventAccessNotice from '#lib/private-events/components/PrivateEventAccessNotice.svelte';
	import { GUEST_SCOPES } from '#lib/private-events/scopes.js';

	let { data } = $props();
</script>

{#snippet linkIsTheInvitation()}
	<p class="text-base-600 dark:text-base-400 mt-4 text-sm" data-testid="link-is-invitation">
		The link is the invitation. atmo doesn't tell you when a host adds you, so an event you're
		invited to shows here only after you open the host's link and answer.
	</p>
{/snippet}

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">Your private events</h1>
	<p class="text-base-600 dark:text-base-400 mt-2 text-sm" data-testid="beta-notice">
		{BETA_WARNING}
		{#if !data.beta}To make your own, turn on private events in
			<a
				href={resolve('/(app)/settings')}
				class="text-accent-600 dark:text-accent-400 hover:underline">Settings</a
			>.{/if}
	</p>
	{#if data.events === null}
		<PrivateEventAccessNotice
			access={data.access ?? 'ask'}
			did={data.did}
			scopes={GUEST_SCOPES}
			purpose="Private events are kept on each host’s server. atmo needs your permission to open them for you and save your answer in your own account."
			label="Allow atmo to open private events"
			spacesServer={data.spacesServer}
		/>
	{:else if data.events.length === 0 && !data.incomplete}
		<p class="text-base-600 dark:text-base-400 mt-4">
			None yet. Events you host show here, and ones you've answered.
		</p>
		{@render linkIsTheInvitation()}
	{:else}
		{#if data.incomplete}
			<p
				class="text-base-600 dark:text-base-400 mt-4 text-sm"
				role="status"
				data-testid="private-events-incomplete"
			>
				Some of your private events couldn't be read just now, so there may be more than these. Try
				again shortly.
			</p>
		{/if}
		{#if data.events.length > 0}
			<ul class="mt-6 space-y-3" data-testid="private-events">
				{#each data.events as item (item.href)}
					<li>
						<EventCard event={item.event} href={item.href} />
						<p class="text-base-600 dark:text-base-400 mt-1 text-xs">
							{item.hosting ? 'You are hosting' : `Hosted by ${item.hostHandle ?? item.event.did}`}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
		{@render linkIsTheInvitation()}
	{/if}
</div>
