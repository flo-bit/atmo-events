<script lang="ts">
	import EventCard from '$lib/components/EventCard.svelte';
	import RecentActivity from '$lib/components/RecentActivity.svelte';
	import { Button } from '@foxui/core';
	import { user } from '$lib/atproto/auth.svelte';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';

	let { data } = $props();

	let hasMyEvents = $derived(
		user.isLoggedIn && (data.myUpcoming.length > 0 || data.myPast.length > 0)
	);
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<div class="mb-32 mt-16 sm:mt-28">
		<h1 class="text-base-900 dark:text-base-50 text-4xl font-bold sm:text-5xl">
			Events for the open social web.
		</h1>
		<p class="text-base-600 dark:text-base-300 mt-5 max-w-2xl text-lg sm:text-xl">
			Open source. Sign in with Bluesky. Your events stay yours.
		</p>
		<div class="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
			{#if user.isLoggedIn}
				<Button href="/create">Create Event</Button>
			{:else}
				<Button onclick={() => atProtoLoginModalState.show()}>Create Event</Button>
			{/if}
			<a
				href="/events"
				class="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
			>
				Browse Events &rarr;
			</a>
		</div>
	</div>

	{#if hasMyEvents}
		<section class="mb-16">
			<div class="mb-8 flex items-baseline justify-between">
				<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Your events</h2>
				<a
					href="/calendar"
					class="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
				>
					Open calendar &rarr;
				</a>
			</div>

			<div class="space-y-10">
				{#if data.myUpcoming.length > 0}
					<div>
						<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">
							Upcoming events
						</h3>
						<div class="grid gap-6 sm:grid-cols-2">
							{#each data.myUpcoming.slice(0, 6) as event (event.uri)}
								<EventCard {event} />
							{/each}
						</div>
					</div>
				{/if}

				{#if data.myPast.length > 0}
					<div>
						<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">
							Recent past events
						</h3>
						<div class="grid gap-6 sm:grid-cols-2">
							{#each data.myPast.slice(0, 4) as event (event.uri)}
								<EventCard {event} />
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<div class="mb-8 flex items-baseline justify-between">
		<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Upcoming Popular Events</h2>
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

	{#if data.recentActivity.length > 0}
		<section class="mt-16">
			<h2 class="text-base-900 dark:text-base-50 text-xl font-bold {data.recentActivityIsPersonalized ? 'mb-1' : 'mb-4'}">
				{data.recentActivityIsPersonalized ? 'From people you follow' : 'Recent activity'}
			</h2>
			{#if data.recentActivityIsPersonalized}
				<p class="text-base-500 dark:text-base-400 mb-4 text-sm">
					Events your Bluesky follows are hosting or going to.
				</p>
			{/if}
			<RecentActivity activities={data.recentActivity} />
		</section>
	{/if}

	{#if !user.isLoggedIn}
		<section class="border-base-200 dark:border-base-800 mt-20 grid gap-10 border-t pt-12 sm:grid-cols-3 sm:gap-8">
			<div>
				<h3 class="text-base-900 dark:text-base-50 mb-2 text-base font-semibold">
					Sign in with Bluesky.
				</h3>
				<p class="text-base-600 dark:text-base-400 text-sm">
					Your network is already here. RSVP with the people you actually follow.
				</p>
			</div>
			<div>
				<h3 class="text-base-900 dark:text-base-50 mb-2 text-base font-semibold">
					Works across apps.
				</h3>
				<p class="text-base-600 dark:text-base-400 text-sm">
					See events from any app on the open social web. Your RSVPs travel with you.
				</p>
			</div>
			<div>
				<h3 class="text-base-900 dark:text-base-50 mb-2 text-base font-semibold">
					Your stuff stays yours.
				</h3>
				<p class="text-base-600 dark:text-base-400 text-sm">
					Events live on your account, not ours. atmo.rsvp is just a view — take everything anywhere.
				</p>
			</div>
		</section>
	{/if}

	<footer class="text-base-500 dark:text-base-400 mt-24 text-center text-sm">
		<a
			href="https://github.com/flo-bit/atmo-events"
			target="_blank"
			rel="noopener"
			class="hover:text-accent-600 dark:hover:text-accent-400 transition-colors"
		>
			View source on GitHub
		</a>
	</footer>
</div>
