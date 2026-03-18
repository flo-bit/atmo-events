<script lang="ts">
	import EventCard from '$lib/components/EventCard.svelte';
	import { Button } from '@foxui/core';
	import { user } from '$lib/atproto/auth.svelte';
	import { atProtoLoginModalState } from '@foxui/social';

	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-32 mt-16 sm:mt-28">
		<h1 class="text-base-900 dark:text-base-50 text-4xl font-bold sm:text-5xl">
			Go outside and meet people!
		</h1>
		{#if user.isLoggedIn}
			<Button href="/create" class="mt-5">
				Create Event
			</Button>
		{:else}
			<Button onclick={() => atProtoLoginModalState.show()} class="mt-5">
				Create Event
			</Button>
		{/if}
	</div>

	<div class="mb-8 flex items-baseline justify-between">
		<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Upcoming Events</h2>
		<a
			href="/events"
			class="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
		>
			See all &rarr;
		</a>
	</div>

	{#if data.events.length === 0}
		<p class="text-base-500 text-center text-lg">No upcoming events found.</p>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2">
			{#each data.events as event (event.uri)}
				<EventCard {event} actor={data.handles[event.did]} />
			{/each}
		</div>
	{/if}
</div>
