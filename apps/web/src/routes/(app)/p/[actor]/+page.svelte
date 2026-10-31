<script lang="ts">
	import { getProfileBlobUrl, type FlatEventRecord } from '#lib/contrail.js';
	import { user } from '#lib/atproto/auth.svelte.js';
	import { Button, UserProfile, blueskyProfileToProfileData } from '@atmo-dev/kit';
	import { EventCard, getLocalProfileUrl } from '@atmo-dev/events-ui';
	import HappeningNow from '#lib/components/HappeningNow.svelte';
	import { resolve } from '$app/paths';

	let { data } = $props();

	let isOwnProfile = $derived(user.isLoggedIn && user.did === data.actorDid);

	let hostProfile = $derived(data.actorProfile);
	let hostDid = $derived(data.actorDid as string);
	let profile = $derived(
		blueskyProfileToProfileData({
			...data.blueskyProfile,
			...hostProfile?.value,
			did: hostDid,
			handle: hostProfile?.handle || data.blueskyProfile?.handle,
			// Contrail's profile is the locally moderated source. Bluesky only enriches it.
			links: data.blueskyProfile?.links,
			avatar:
				getProfileBlobUrl(hostDid, hostProfile?.value?.avatar, 'avatar') ??
				data.blueskyProfile?.avatar,
			banner:
				getProfileBlobUrl(hostDid, hostProfile?.value?.banner, 'banner') ??
				data.blueskyProfile?.banner
		})
	);

	// `data.actor` is OPTIONAL in the load's return type: an invalid route param
	// returns early and leaves the page with no data at all. The DID names the same
	// profile and the route accepts either, so it stands in to keep this a string.
	let profileActor = $derived(data.actor ?? hostDid);

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

<div class="px-6 py-1 sm:py-2">
	<div class="mx-auto max-w-2xl">
		<!-- Header -->
		{#if profile}
			<UserProfile
				{profile}
				socialClient={user.preferredSocialClient}
				mentionUrl={getLocalProfileUrl}
				metrics={data.eventCounts
					? [
							{ label: 'events created', value: data.eventCounts.created },
							{ label: 'events RSVP’d', value: data.eventCounts.rsvpd }
						]
					: []}
				class="mb-10 pt-6 sm:pt-8"
			>
				{#snippet actions()}
					{#if isOwnProfile && data.isModerator}
						<Button href={resolve('/(app)/mod')} variant="ghost">Reports</Button>
					{/if}
				{/snippet}
			</UserProfile>
		{/if}

		<!-- Its own section, as on every other surface. Interleaving the two under one
		     heading made this the one page where a reader had to read a badge to tell
		     "under way" from "not started yet" — the distinction the section exists to
		     draw. "See all" leads to this host's hosting list, which runs the same
		     band uncapped. -->
		<HappeningNow
			events={data.ongoingEvents ?? []}
			total={data.ongoingTotal}
			totalIsFloor={data.ongoingTotalIsFloor}
			actor={data.actor}
			seeAllHref={resolve('/(app)/p/[actor]/hosting', { actor: profileActor })}
			sectionClass="mb-10"
			gridClass="space-y-5"
		/>

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

		<!-- `ongoingEvents` counts here too. A host whose only event is running RIGHT
		     NOW has cards on the page, and claiming underneath them that they have
		     never created an event contradicts what the reader can see. -->
		{#if !data.ongoingEvents?.length && !data.upcomingEvents?.length && !upcomingAttendingEvents.length && !data.pastEvents?.length}
			<div
				class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 rounded-2xl border p-8 text-center"
			>
				<p class="text-muted py-12 text-center">
					{isOwnProfile
						? "You haven't created or attended any events yet."
						: "This person hasn't created or attended any events yet."}
				</p>
			</div>
		{/if}
	</div>
</div>
