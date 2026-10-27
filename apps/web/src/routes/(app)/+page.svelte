<script lang="ts">
	import { EventCard } from '@atmo-dev/events-ui';
	import RecentActivity from '#lib/components/RecentActivity.svelte';
	import HeroGlobe from '#lib/components/HeroGlobe.svelte';
	import { Button } from '@atmo-dev/kit';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import { createEventModalState } from '#lib/components/CreateEventModal.svelte';

	let { data } = $props();

	let hasMyEvents = $derived(
		user.isLoggedIn && (data.myUpcoming.length > 0 || data.myPast.length > 0)
	);
</script>

<div class="py-8 sm:py-12">
	<section class="home-hero mx-auto mb-16 max-w-3xl px-6" aria-labelledby="home-heading">
		<div class="home-hero-copy">
			<h1
				id="home-heading"
				class="text-base-900 dark:text-base-50 text-4xl font-semibold tracking-tight sm:text-5xl"
			>
				Events for the open social web.
			</h1>
			<div class="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
				{#if user.isLoggedIn}
					<Button onclick={() => createEventModalState.show()}>Create Event</Button>
				{:else}
					<Button onclick={() => atProtoLoginModalState.show()}>Create Event</Button>
				{/if}
				<a
					href="/events"
					class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
				>
					Browse Events &rarr;
				</a>
			</div>
		</div>
		<div class="home-hero-art">
			<HeroGlobe />
		</div>
	</section>

	<div class="mx-auto max-w-3xl px-6">
		{#if hasMyEvents}
			<section class="mb-16">
				<div class="mb-8 flex items-baseline justify-between">
					<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Your events</h2>
					<a
						href="/calendar"
						class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
					>
						Open calendar &rarr;
					</a>
				</div>

				<div class="space-y-8">
					{#if data.myUpcoming.length > 0}
						<div>
							<h3 class="text-base-600 dark:text-base-400 mb-4 text-sm font-medium">
								Upcoming events
							</h3>
							<div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
							<div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
				class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 shrink-0 text-sm font-medium whitespace-nowrap transition-colors"
			>
				See all &rarr;
			</a>
		</div>

		{#if data.events.length === 0}
			<p class="text-base-500 text-center text-lg">No upcoming events found.</p>
		{:else}
			<div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
				{#each data.events as event (event.uri)}
					<EventCard {event} actor={data.handles[event.did]} />
				{/each}
			</div>
		{/if}

		{#if data.recentActivity.length > 0}
			<section class="mt-16">
				<h2
					class="text-base-900 dark:text-base-50 text-xl font-bold {data.recentActivityIsPersonalized
						? 'mb-1'
						: 'mb-4'}"
				>
					{data.recentActivityIsPersonalized ? 'From people you follow' : 'Recent activity'}
				</h2>
				{#if data.recentActivityIsPersonalized}
					<p class="text-muted mb-4 text-sm">
						Events your Bluesky follows are hosting or going to.
					</p>
				{/if}
				<RecentActivity activities={data.recentActivity} />
			</section>
		{/if}

		{#if !user.isLoggedIn}
			<section
				class="border-base-200 dark:border-base-800 mt-20 grid gap-10 border-t pt-12 sm:grid-cols-3 sm:gap-8"
			>
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
						Events live on your account, not ours. atmo.rsvp is just a view — take everything
						anywhere.
					</p>
				</div>
			</section>
		{/if}

		<footer class="text-muted mt-24 text-center text-sm">
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
</div>

<style>
	.home-hero {
		display: grid;
	}
	.home-hero-art {
		grid-row: 1;
		width: min(99%, 25.85rem);
		justify-self: end;
		transform: translateY(-1rem);
	}
	.home-hero-copy {
		position: relative;
		margin-top: -0.5rem;
	}
	@media (min-width: 768px) {
		.home-hero {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.home-hero-art {
			grid-column: 2;
			width: calc(110% + 0.55rem);
		}
		.home-hero-copy {
			grid-area: 1 / 1;
			margin-top: 16.5rem;
		}
	}
</style>
