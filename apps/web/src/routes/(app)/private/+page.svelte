<script lang="ts">
	import { EventCard } from '@atmo-dev/kit/events';
	import PrivateEventAccessNotice from '#lib/private-events/components/PrivateEventAccessNotice.svelte';
	import { GUEST_SCOPES } from '#lib/private-events/scopes.js';

	let { data } = $props();
</script>

{#snippet linkIsTheInvitation()}
	<p class="text-muted mt-4 text-sm" data-testid="link-is-invitation">
		The link is the invitation. atmo doesn't tell you when a host adds you, so an event you're
		invited to shows here only after you open the host's link and answer.
	</p>
{/snippet}

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<div class="mx-auto max-w-2xl px-6 pt-12 pb-24">
	<h1 class="text-base-900 dark:text-base-50 text-2xl font-semibold">Your private events</h1>
	{#if data.events === null}
		<PrivateEventAccessNotice
			access={data.access ?? 'ask'}
			did={data.did}
			scopes={GUEST_SCOPES}
			purpose="Private events are kept on each host’s server. atmo needs your permission to open them for you and save your answer in your own account."
			label="Allow atmo to open private events"
			spacesServer={data.spacesServer}
		/>
	{:else if data.events.length === 0}
		<p class="text-muted mt-4">None yet. Events you host show here, and ones you've answered.</p>
		{@render linkIsTheInvitation()}
	{:else}
		<ul class="mt-6 space-y-4" data-testid="private-events">
			{#each data.events as item (item.href)}
				<li>
					<EventCard event={item.event} href={item.href} />
					<p class="text-muted mt-1 text-xs">
						{item.hosting ? 'You are hosting' : `Hosted by ${item.hostHandle ?? item.event.did}`}
					</p>
				</li>
			{/each}
		</ul>
		{@render linkIsTheInvitation()}
	{/if}
</div>
