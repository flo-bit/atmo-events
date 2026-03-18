<script lang="ts">
	import { getProfileBlobUrl } from '$lib/contrail';
	import EventCard from '$lib/components/EventCard.svelte';

	let { data } = $props();

	let hostProfile = $derived(data.actorProfile);
	let hostDid = $derived(data.actorDid as string);
	let hostName = $derived(hostProfile?.record?.displayName || hostProfile?.handle || hostDid);
	let hostAvatar = $derived(
		hostProfile?.record?.avatar ? getProfileBlobUrl(hostDid, hostProfile.record.avatar) : undefined
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

		{#if (data.events?.length ?? 0) > 0}
			<div class="space-y-3">
				{#each data.events as event (event.uri)}
					<EventCard {event} actor={data.actor} />
				{/each}
			</div>

			{#if data.cursor}
				<div class="mt-6 text-center">
					<a
						href="?cursor={data.cursor}"
						class="bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50 hover:bg-base-300 dark:hover:bg-base-700 inline-block rounded-xl px-5 py-2 text-sm font-medium transition-colors"
					>
						Load more
					</a>
				</div>
			{/if}
		{:else}
			<p class="text-base-500 dark:text-base-400 py-12 text-center">
				No past events found.
			</p>
		{/if}
	</div>
</div>
