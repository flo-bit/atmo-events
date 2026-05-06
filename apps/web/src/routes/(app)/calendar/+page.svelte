<script lang="ts">
	import EventCard from '$lib/components/EventCard.svelte';
	import { Button, Modal } from '@foxui/core';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { user } from '$lib/atproto/auth.svelte';

	let { data } = $props();

	let calendarModalOpen = $state(false);
	let copied = $state(false);

	let calendarUrl = $derived(
		user.profile?.handle ? `https://atmo.rsvp/p/${user.profile.handle}/calendar.ics` : ''
	);

	let hasEvents = $derived(data.upcoming.length > 0 || data.past.length > 0);

	async function copyAndShowModal() {
		if (!calendarUrl) return;
		try {
			await navigator.clipboard.writeText(calendarUrl);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 3000);
		} catch {
			// clipboard may fail silently
		}
		calendarModalOpen = true;
	}
</script>

<svelte:head>
	<title>Calendar</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-2 flex items-center justify-between">
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">Calendar</h1>
		{#if data.loggedIn && hasEvents}
			<Button variant="secondary" onclick={copyAndShowModal}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-4 w-4 sm:mr-1.5"
				>
					<path
						fill-rule="evenodd"
						d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="hidden sm:inline">Add to your calendar</span>
			</Button>
		{/if}
	</div>
	<p class="text-base-700 dark:text-base-300 mb-8 mt-4 text-sm">
		Events you're hosting, attending or interested in
	</p>

	{#if !data.loggedIn}
		<div
			class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 rounded-2xl border p-8 text-center"
		>
			<p class="text-base-600 dark:text-base-400 mb-4">Log in to see your events</p>
			<Button onclick={() => atProtoLoginModalState.show()}>Login</Button>
		</div>
	{:else if !hasEvents}
		<div
			class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 rounded-2xl border p-8 text-center"
		>
			<p class="text-base-600 dark:text-base-400 text-center text-sm">
				No events on your calendar.
			</p>
			<div class="mt-6 flex justify-center gap-3">
				<Button href="/">Join events</Button>
				<Button href="/create" variant="secondary">Create event</Button>
			</div>
		</div>
	{:else}
		<div class="space-y-10">
			{#if data.upcoming.length > 0}
				<div>
					<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">
						Upcoming events
					</h3>
					<div class="grid gap-6 sm:grid-cols-2">
						{#each data.upcoming as event (event.uri)}
							<EventCard {event} />
						{/each}
					</div>
				</div>
			{/if}

			{#if data.past.length > 0}
				<div>
					<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">
						Past events
					</h3>
					<div class="grid gap-6 sm:grid-cols-2">
						{#each data.past as event (event.uri)}
							<EventCard {event} />
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<Modal bind:open={calendarModalOpen}>
			<div class="min-w-0 space-y-4 overflow-hidden">
				<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">
					Add to your calendar
				</h2>
				<p class="text-base-600 dark:text-base-400 text-sm">
					Subscribe to your events calendar using the URL below. Your calendar will stay in
					sync automatically as you RSVP to new events.
				</p>

				<button
					class="border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 hover:bg-base-100 dark:hover:bg-base-800 flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
					onclick={async () => {
						try {
							await navigator.clipboard.writeText(calendarUrl);
							copied = true;
							setTimeout(() => {
								copied = false;
							}, 3000);
						} catch {
							// ignore
						}
					}}
				>
					<code class="text-base-700 dark:text-base-300 flex-1 truncate text-left text-xs">
						{calendarUrl}
					</code>
					<span class="text-base-500 shrink-0 text-xs font-medium">
						{copied ? 'Copied!' : 'Copy'}
					</span>
				</button>

				<div class="space-y-3 pt-2">
					<div>
						<h3 class="text-base-800 dark:text-base-200 text-sm font-medium">
							Apple Calendar
						</h3>
						<ol
							class="text-base-600 dark:text-base-400 mt-1 list-inside list-decimal space-y-0.5 text-sm"
						>
							<li>Open Apple Calendar</li>
							<li>Go to File &rarr; New Calendar Subscription</li>
							<li>Paste the URL above and click Subscribe</li>
						</ol>
					</div>

					<div>
						<h3 class="text-base-800 dark:text-base-200 text-sm font-medium">
							Google Calendar
						</h3>
						<ol
							class="text-base-600 dark:text-base-400 mt-1 list-inside list-decimal space-y-0.5 text-sm"
						>
							<li>Open Google Calendar in your browser</li>
							<li>Click the + next to "Other calendars" in the sidebar</li>
							<li>Select "From URL"</li>
							<li>Paste the URL above and click "Add calendar"</li>
						</ol>
					</div>
				</div>
			</div>
		</Modal>
	{/if}
</div>
