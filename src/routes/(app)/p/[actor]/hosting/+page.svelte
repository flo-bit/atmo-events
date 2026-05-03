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

	let fetchParams: Record<string, string> = $derived({
		profiles: 'true',
		sort: 'startsAt',
		order: 'asc',
		startsAtMin: new Date().toISOString(),
		...(data.actor ? { actor: data.actor } : {}),
		limit: '20'
	});
</script>

<svelte:head>
	<title>Upcoming Events - {hostName}</title>
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
			Upcoming Events
		</h1>
		<a href="/p/{data.actor}" class="mt-4 mb-6 flex items-center gap-2 text-sm text-base-500 dark:text-base-400">
			by
			{#if hostAvatar}
				<img src={hostAvatar} alt="" class="h-5 w-5 rounded-full object-cover" />
			{/if}
			{hostName}
		</a>

		{#if (data.events?.length ?? 0) > 0}
			<EventList
				events={data.events ?? []}
				cursor={data.cursor ?? null}
				actor={data.actor}
				{fetchParams}
				gridClass="space-y-3"
			/>
		{:else}
			<p class="text-base-500 dark:text-base-400 py-12 text-center">
				No upcoming events found.
			</p>
		{/if}
	</div>
</div>
