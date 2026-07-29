<script lang="ts">
	import { getProfileBlobUrl } from '$lib/contrail';
	import EventList from '$lib/components/EventList.svelte';
	import { resolve } from '$app/paths';

	let { data } = $props();

	let hostProfile = $derived(data.actorProfile);
	let hostDid = $derived(data.actorDid as string);
	let hostName = $derived(hostProfile?.value?.displayName || hostProfile?.handle || hostDid);
	let hostAvatar = $derived(
		hostProfile?.value?.avatar ? getProfileBlobUrl(hostDid, hostProfile.value.avatar) : undefined
	);

	// Who the two links out of this page point at — the back link and the "by
	// <host>" attribution both go to the same profile.
	//
	// `data.actor` is OPTIONAL in the load's return type, because an invalid route
	// param returns early and leaves the page with no data at all. The DID names
	// the same profile and the route accepts either, so it stands in to keep this
	// a string; it is not a rescue for that early return, which unsets both and
	// leaves a page with no host to link to in the first place.
	//
	// resolve() is then called at each href rather than hoisted into one here:
	// through a variable the lint rule cannot see that the destination was
	// resolved, and a suppression would cost more than the repeated call.
	let profileActor = $derived(data.actor ?? hostDid);
</script>

<svelte:head>
	<title>Upcoming Events - {hostName}</title>
</svelte:head>

<div class="min-h-screen px-6 py-12 sm:py-12">
	<div class="mx-auto max-w-2xl">
		<div class="mb-6">
			<a
				href={resolve('/(app)/p/[actor]', { actor: profileActor })}
				class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 text-sm font-medium transition-colors"
			>
				&larr; Back to profile
			</a>
		</div>

		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">
			{(data.ongoing?.length ?? 0) > 0 ? 'Events' : 'Upcoming Events'}
		</h1>
		<a
			href={resolve('/(app)/p/[actor]', { actor: profileActor })}
			class="text-base-500 dark:text-base-400 mt-4 mb-6 flex items-center gap-2 text-sm"
		>
			by
			{#if hostAvatar}
				<img src={hostAvatar} alt="" class="h-5 w-5 rounded-full object-cover" />
			{/if}
			{hostName}
		</a>

		{#if (data.events?.length ?? 0) > 0 || (data.ongoing?.length ?? 0) > 0}
			<!-- This page's band runs UNCAPPED for the actor, so it is already the
			     whole set: no "See all", rather than one pointing at the global
			     /events/now, which is a different and wider list. -->
			<EventList
				events={data.events ?? []}
				cursor={data.cursor ?? null}
				actor={data.actor}
				ongoing={data.ongoing ?? []}
				ongoingSeeAllHref={null}
				gridClass="space-y-3"
			/>
		{:else}
			<p class="text-base-500 dark:text-base-400 py-12 text-center">No upcoming events found.</p>
		{/if}
	</div>
</div>
