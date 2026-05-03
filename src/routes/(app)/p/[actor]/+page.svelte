<script lang="ts">
	import { getProfileBlobUrl, type FlatEventRecord } from '$lib/contrail';
	import { user, logout } from '$lib/atproto/auth.svelte';
	import UserProfile from '$lib/components/UserProfile.svelte';
	import { Button } from '@foxui/core';
	import EventCard from '$lib/components/EventCard.svelte';

	let { data } = $props();

	let isOwnProfile = $derived(user.isLoggedIn && user.did === data.actorDid);

	let hostProfile = $derived(data.actorProfile);
	let hostDid = $derived(data.actorDid as string);
	let hostName = $derived(hostProfile?.value?.displayName || hostProfile?.handle || hostDid);

	let now = $derived(new Date());

	let upcomingAttendingEvents = $derived(
		[...(data.attendingEvents ?? [])]
			.filter((event: FlatEventRecord) => {
				const endDate = new Date(event.endsAt || event.startsAt);
				return endDate >= now;
			})
			.sort(
				(a: FlatEventRecord, b: FlatEventRecord) =>
					new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
			)
	);
</script>

<svelte:head>
	<title>{hostName} - Events</title>
	<meta name="description" content="Events hosted by {hostName}" />
	<meta property="og:title" content="{hostName} - Events" />
	<meta property="og:description" content="Events hosted by {hostName}" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="{hostName} - Events" />
	<meta name="twitter:description" content="Events hosted by {hostName}" />
</svelte:head>

<div class="px-6 py-1 sm:py-2">
	<div class="mx-auto max-w-2xl">
		<!-- Header -->
		<UserProfile
			profile={{
				handle: hostProfile?.handle,
				displayName: hostName,
				avatar: hostProfile?.value?.avatar
					? getProfileBlobUrl(hostDid, hostProfile.value.avatar)
					: undefined
			}}
		>
			{#snippet actions()}
				{#if isOwnProfile}
					<Button onclick={logout} variant="primary" class="rose">Logout</Button>
				{/if}
			{/snippet}
		</UserProfile>

		{#if isOwnProfile}
			<Button href="/create" class="-mt-6 mb-6" size="lg">Create Event</Button>
		{/if}

		<!-- Upcoming Events -->
		{#if (data.upcomingEvents?.length ?? 0) > 0}
			<section class="mb-10">
				<div class="mb-4 flex items-baseline justify-between">
					<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Upcoming Events</h2>
					{#if data.hasMoreUpcoming}
						<a
							href="/p/{data.actor}/hosting"
							class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
						>
							See all &rarr;
						</a>
					{/if}
				</div>
				<div class="space-y-5">
					{#each data.upcomingEvents as event (event.uri)}
						<EventCard {event} actor={data.actor} />
					{/each}
				</div>
			</section>
		{/if}

		<!-- Attending -->
		{#if upcomingAttendingEvents.length > 0}
			<section class="mb-10">
				<h2 class="text-base-900 dark:text-base-50 mb-4 text-lg font-semibold">Attending</h2>
				<div class="space-y-5">
					{#each upcomingAttendingEvents as event (event.uri)}
						<EventCard {event} />
					{/each}
				</div>
			</section>
		{/if}

		<!-- Past Events -->
		{#if (data.pastEvents?.length ?? 0) > 0}
			<section class="mb-10">
				<div class="mb-4 flex items-baseline justify-between">
					<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Past Events</h2>
					{#if data.hasMorePast}
						<a
							href="/p/{data.actor}/past-events"
							class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
						>
							See all &rarr;
						</a>
					{/if}
				</div>
				<div class="space-y-5">
					{#each data.pastEvents as event (event.uri)}
						<EventCard {event} actor={data.actor} />
					{/each}
				</div>
			</section>
		{/if}

		{#if !data.upcomingEvents?.length && !upcomingAttendingEvents.length && !data.pastEvents?.length}
			<div
				class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 rounded-2xl border p-8 text-center"
			>
				<p class="text-base-500 dark:text-base-400 py-12 text-center">
					{isOwnProfile
						? "You haven't created or attended any events yet."
						: "This person hasn't created or attended any events yet."}
				</p>
			</div>
		{/if}
	</div>
</div>
