<script lang="ts">
	import EventCard from '$lib/components/EventCard.svelte';
	import { Button } from '@foxui/core';
	import { atProtoLoginModalState } from '@foxui/social';

	let { data } = $props();
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-8 text-2xl font-bold">Calendar</h1>

	{#if !data.loggedIn}
		<div
			class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-900/50 rounded-2xl border p-8 text-center"
		>
			<p class="text-base-600 dark:text-base-400 mb-4">Log in to see events you're attending.</p>
			<Button onclick={() => atProtoLoginModalState.show()}>Login</Button>
		</div>
	{:else if data.events.length === 0}
		<p class="text-base-600 dark:text-base-400 text-center text-sm">No upcoming events on your calendar.</p>
		<div class="mt-6 flex justify-center gap-3">
			<Button href="/">Join events</Button>
			<Button href="/create" variant="secondary">Create event</Button>
		</div>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2">
			{#each data.events as event (event.uri)}
				<EventCard {event} />
			{/each}
		</div>
	{/if}
</div>
