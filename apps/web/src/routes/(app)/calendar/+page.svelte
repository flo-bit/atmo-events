<script lang="ts">
	import { EventCard } from '@atmo-dev/events-ui';
	import { Button, Icon, Modal } from '@atmo-dev/kit';
	import { CalendarPlus } from '@sketchyicons/svelte';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { createEventModalState } from '$lib/components/CreateEventModal.svelte';
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

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-2 flex items-center justify-between">
		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">Calendar</h1>
		{#if data.loggedIn && hasEvents}
			<Button variant="secondary" onclick={copyAndShowModal} aria-label="Add to your calendar">
				<Icon img={CalendarPlus} size={18} />
				<span class="hidden sm:inline">Add to your calendar</span>
			</Button>
		{/if}
	</div>
	<p class="text-base-700 dark:text-base-300 mt-4 mb-8 text-sm">
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
				<Button onclick={() => createEventModalState.show()} variant="secondary">
					Create event
				</Button>
			</div>
		</div>
	{:else}
		<div class="space-y-10">
			{#if data.upcoming.length > 0}
				<div>
					<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">Upcoming events</h3>
					<div class="grid gap-6 sm:grid-cols-2">
						{#each data.upcoming as event (event.uri)}
							<EventCard {event} />
						{/each}
					</div>
				</div>
			{/if}

			{#if data.past.length > 0}
				<div>
					<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">Past events</h3>
					<div class="grid gap-6 sm:grid-cols-2">
						{#each data.past as event (event.uri)}
							<EventCard {event} />
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<Modal bind:open={calendarModalOpen} title="Add to your calendar">
			<div class="min-w-0 space-y-4 overflow-hidden">
				<p class="text-base-600 dark:text-base-400 text-sm">
					Subscribe to your events calendar using the URL below. Your calendar will stay in sync
					automatically as you RSVP to new events.
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
						<h3 class="text-base-800 dark:text-base-200 text-sm font-medium">Apple Calendar</h3>
						<ol
							class="text-base-600 dark:text-base-400 mt-1 list-inside list-decimal space-y-0.5 text-sm"
						>
							<li>Open Apple Calendar</li>
							<li>Go to File &rarr; New Calendar Subscription</li>
							<li>Paste the URL above and click Subscribe</li>
						</ol>
					</div>

					<div>
						<h3 class="text-base-800 dark:text-base-200 text-sm font-medium">Google Calendar</h3>
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
