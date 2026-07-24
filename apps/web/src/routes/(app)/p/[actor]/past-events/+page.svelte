<script lang="ts">
	import { getProfileBlobUrl } from '$lib/contrail';
	import EventList from '$lib/components/EventList.svelte';

	let { data } = $props();

	let hostProfile = $derived(data.actorProfile);
	let hostDid = $derived(data.actorDid as string);
	let hostName = $derived(hostProfile?.value?.displayName || hostProfile?.handle || hostDid);
	let hostAvatar = $derived(
		hostProfile?.value?.avatar ? getProfileBlobUrl(hostDid, hostProfile.value.avatar) : undefined
	);
</script>

<svelte:head>
	<title>Past Events - {hostName}</title>
</svelte:head>

<div class="min-h-screen px-6 py-12 sm:py-12">
	<div class="mx-auto max-w-2xl">
		<div class="mb-6">
			<a
				href="/p/{data.actor}"
				class="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
			>
				&larr; Back to profile
			</a>
		</div>

		<h1 class="text-base-900 dark:text-base-50 text-2xl font-bold">
			Past Events
		</h1>
		<a href="/p/{data.actor}" class="mt-4 mb-6 flex items-center gap-2 text-sm text-base-500 dark:text-base-400">
			by
			{#if hostAvatar}
				<img src={hostAvatar} alt="" class="h-5 w-5 rounded-full object-cover" />
			{/if}
			{hostName}
		</a>

		<!-- Also render when this batch filtered down to nothing but more pages
		     remain: the ended-event predicate runs after pagination, so a first
		     batch of only ongoing events would otherwise show "no past events"
		     and strand the genuinely past ones behind a button never drawn. -->
		{#if (data.events?.length ?? 0) > 0 || data.cursor}
			<EventList
				events={data.events ?? []}
				cursor={data.cursor ?? null}
				actor={data.actor}
				gridClass="space-y-3"
			/>
		{:else}
			<p class="text-base-500 dark:text-base-400 py-12 text-center">
				No past events found.
			</p>
		{/if}
	</div>
</div>
