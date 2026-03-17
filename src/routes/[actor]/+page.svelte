<script lang="ts">
	import type { EventData } from '$lib/event-types';
	import { getCDNImageBlobUrl } from '$lib/atproto';
	import { user } from '$lib/atproto/auth.svelte';
	import { Avatar as FoxAvatar, Badge, Button, toast } from '@foxui/core';
	import { page } from '$app/state';
	import Avatar from 'svelte-boring-avatars';
	import * as TID from '@atcute/tid';
	import { goto } from '$app/navigation';
	import { UserProfile } from '@foxui/social';

	let { data } = $props();

	let events = $derived(data.events ?? []);

	let hostProfile = $derived(data.profiles?.[data.did]);

	let hostName = $derived(hostProfile?.record?.displayName || hostProfile?.handle || data.did);
	let hostUrl = $derived(`https://bsky.app/profile/${hostProfile?.handle || data.did}`);

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		};
		if (date.getFullYear() !== new Date().getFullYear()) {
			options.year = 'numeric';
		}
		return date.toLocaleDateString('en-US', options);
	}

	function formatTime(dateStr: string): string {
		return new Date(dateStr).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getModeLabel(mode: string): string {
		if (mode.includes('virtual')) return 'Virtual';
		if (mode.includes('hybrid')) return 'Hybrid';
		if (mode.includes('inperson')) return 'In-Person';
		return 'Event';
	}

	function getModeColor(mode: string): 'cyan' | 'purple' | 'amber' | 'secondary' {
		if (mode.includes('virtual')) return 'cyan';
		if (mode.includes('hybrid')) return 'purple';
		if (mode.includes('inperson')) return 'amber';
		return 'secondary';
	}

	function getLocationString(locations: EventData['locations']): string | undefined {
		if (!locations || locations.length === 0) return undefined;

		const loc = locations.find((v) => v.$type === 'community.lexicon.location.address') as
			| { street?: string; locality?: string; region?: string }
			| undefined;
		if (!loc) return undefined;

		const locality = loc.locality || undefined;
		const region = loc.region || undefined;

		const parts = [locality, region].filter(Boolean);
		return parts.length > 0 ? parts.join(', ') : undefined;
	}

	function getThumbnail(event: EventData): { url: string; alt: string } | null {
		if (!event.media || event.media.length === 0) return null;
		const media = event.media.find((m) => m.role === 'thumbnail');
		if (!media?.content) return null;
		const url = getCDNImageBlobUrl({ did: data.did, blob: media.content });
		if (!url) return null;
		return { url, alt: media.alt || event.name };
	}

	let isOwner = $derived(user.isLoggedIn && user.did === data.did);

	let showPast: boolean = $state(false);
	let now = $derived(new Date());
	let filteredEvents = $derived(
		// events.filter((e) => {
		// 	const endOrStart = e.endsAt || e.startsAt;
		// 	const eventDate = new Date(endOrStart);
		// 	return showPast ? eventDate < now : eventDate >= now;
		// })
		[]
	);

	$inspect(hostProfile);
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

<div class="min-h-screen px-6 py-12 sm:py-12">
	<div class="mx-auto max-w-3xl">
		<!-- Header -->
			<UserProfile profile={{
		handle: hostProfile?.handle,
		displayName: hostName,
		avatar: hostProfile?.record?.avatar ? getCDNImageBlobUrl({ did: data.did, blob: hostProfile.record.avatar }) : undefined,
		banner: hostProfile?.record?.banner ? getCDNImageBlobUrl({ did: data.did, blob: hostProfile.record.banner }) : undefined,
	}}
/>

		<div class="mb-8 flex items-start justify-between">
			<div>
				<h1 class="text-base-900 dark:text-base-50 mb-2 text-xl font-bold sm:text-2xl">
					Events by {hostName}
				</h1>
			</div>
		</div>

		<!-- Toggle -->
		<div class="mb-6 flex gap-1">
			<button
				class="rounded-xl px-3 py-1.5 text-sm font-medium transition-colors {!showPast
					? 'bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50'
					: 'text-base-500 dark:text-base-400 hover:text-base-700 dark:hover:text-base-200  cursor-pointer'}"
				onclick={() => (showPast = false)}>Upcoming</button
			>
			<button
				class="rounded-xl px-3 py-1.5 text-sm font-medium transition-colors {showPast
					? 'bg-base-200 dark:bg-base-800 text-base-900 dark:text-base-50'
					: 'text-base-500 dark:text-base-400 hover:text-base-700 dark:hover:text-base-200  cursor-pointer'}"
				onclick={() => (showPast = true)}>Past</button
			>
		</div>

		{#if events.length === 0}
			<p class="text-base-500 dark:text-base-400 py-12 text-center">
				No {showPast ? 'past' : 'upcoming'} events.
			</p>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each events as event (event.rkey)}
					{@const thumbnail = getThumbnail(event)}
					{@const location = getLocationString(event.locations)}
					{@const rkey = event.rkey}
					<a
						href="./{rkey}"
						class="border-base-200 dark:border-base-800 hover:border-base-300 dark:hover:border-base-700 group bg-base-100 dark:bg-base-950 block overflow-hidden rounded-2xl border transition-colors"
					>
						<!-- Thumbnail -->
						<div class="p-4">
							{#if thumbnail}
								<img
									src={thumbnail.url}
									alt={thumbnail.alt}
									class="aspect-square w-full rounded-2xl object-cover"
								/>
							{:else}
								<div
									class="bg-base-100 dark:bg-base-900 aspect-square w-full overflow-hidden rounded-2xl [&>svg]:h-full [&>svg]:w-full"
								>
									<Avatar
										size={400}
										name={rkey}
										variant="marble"
										colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
										square
									/>
								</div>
							{/if}
						</div>

						<!-- Content -->
						<div class="p-4">
							<h2
								class="text-base-900 dark:text-base-50 group-hover:text-base-700 dark:group-hover:text-base-200 mb-1 leading-snug font-semibold"
							>
								{event.name}
							</h2>

							<p class="text-base-500 dark:text-base-400 mb-2 text-sm">
								{formatDate(event.startsAt)} &middot; {formatTime(event.startsAt)}
							</p>

							<div class="flex flex-wrap items-center gap-2">
								{#if event.mode}
									<Badge size="sm" variant={getModeColor(event.mode)}
										>{getModeLabel(event.mode)}</Badge
									>
								{/if}

								{#if location}
									<span class="text-base-500 dark:text-base-400 truncate text-xs">{location}</span>
								{/if}
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
