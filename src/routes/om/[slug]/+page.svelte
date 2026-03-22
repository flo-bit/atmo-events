<script lang="ts">
	import { Avatar as FoxAvatar, Badge } from '@foxui/core';
	import { marked } from 'marked';
	import { sanitize } from '$lib/cal/sanitize';
	import EventDetail from '$lib/components/EventDetail.svelte';
	import Map from '$lib/components/Map.svelte';
	import OpenMeetRsvp from './OpenMeetRsvp.svelte';

	let { data } = $props();

	function getModeLabel(mode: string | undefined): string {
		if (!mode) return 'Event';
		if (mode.includes('virtual')) return 'Virtual';
		if (mode.includes('hybrid')) return 'Hybrid';
		if (mode.includes('inperson')) return 'In-Person';
		return 'Event';
	}

	function getModeColor(mode: string | undefined): 'cyan' | 'purple' | 'amber' | 'secondary' {
		if (!mode) return 'secondary';
		if (mode.includes('virtual')) return 'cyan';
		if (mode.includes('hybrid')) return 'purple';
		if (mode.includes('inperson')) return 'amber';
		return 'secondary';
	}

	function getLocationString(locations: Array<{ $type: string; description?: string }> | undefined): string | null {
		if (!locations?.length) return null;
		return locations[0].description || null;
	}
</script>

<svelte:head>
	{#if data.event}
		<title>{data.event.name}</title>
		<meta name="description" content={data.event.description || `Event: ${data.event.name}`} />
	{:else}
		<title>Event</title>
	{/if}
</svelte:head>

{#if data.state === 'ok' && data.event}
	{@const event = data.event}
	{@const descriptionHtml = event.description
		? sanitize(marked.parse(event.description) as string)
		: null}
	{@const locationStr = getLocationString(event.locations)}
	{@const location = locationStr
		? {
				text: locationStr,
				mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`
			}
		: null}
	{@const geoLocation = event.lat != null && event.lon != null
		? { lat: event.lat, lng: event.lon }
		: null}
	{@const hostUrl = event.user?.did ? `/p/${event.user.handle || event.user.did}` : null}

	<EventDetail
		name={event.name}
		image={event.media?.find(m => m.role === 'thumbnail')?.url}
		avatarSeed={event.slug}
		startsAt={new Date(event.startsAt)}
		endsAt={event.endsAt ? new Date(event.endsAt) : null}
		{descriptionHtml}
		{location}
	>
		{#snippet badges()}
			<Badge size="md" variant={getModeColor(event.mode)}>{getModeLabel(event.mode)}</Badge>
			<Badge size="md" variant="secondary">{event.visibility}</Badge>
			{#if event.group}
				<Badge size="md" variant="secondary">{event.group.name}</Badge>
			{/if}
		{/snippet}

		{#snippet rsvp()}
			{#if event.attendeesCount > 0}
				<p class="text-base-500 dark:text-base-400 mb-6 text-sm">
					{event.attendeesCount} attendee{event.attendeesCount !== 1 ? 's' : ''}
					{#if event.userRsvpStatus}
						&middot; You're {event.userRsvpStatus}
					{/if}
				</p>
			{/if}
			<OpenMeetRsvp userRsvpStatus={event.userRsvpStatus} />
		{/snippet}

		{#snippet belowDescription()}
			{#if geoLocation && location}
				<div class="mt-8 mb-8">
					<p
						class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
					>
						Location
					</p>
					<a
						href={location.mapsUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="block transition-opacity hover:opacity-80"
					>
						<div class="h-64 w-full overflow-hidden rounded-xl">
							<Map lat={geoLocation.lat} lng={geoLocation.lng} />
						</div>
						<p class="text-base-500 dark:text-base-400 mt-2 text-sm">
							{locationStr}
						</p>
					</a>
				</div>
			{/if}
		{/snippet}

		{#snippet sidebar()}
			<!-- Hosted By -->
			{#if event.user}
				<div>
					<p
						class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
					>
						Hosted By
					</p>
					{#if hostUrl}
						<a
							href={hostUrl}
							class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
						>
							<FoxAvatar
								src={event.user.avatar}
								alt={event.user.displayName || event.user.handle || event.user.did}
								class="size-8 shrink-0"
							/>
							<span class="truncate text-sm">
								{event.user.displayName || event.user.handle || event.user.did}
							</span>
						</a>
					{:else}
						<div
							class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium"
						>
							<FoxAvatar
								src={event.user.avatar}
								alt={event.user.displayName || 'Organizer'}
								class="size-8 shrink-0"
							/>
							<span class="truncate text-sm">
								{event.user.displayName || 'Organizer'}
							</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Group -->
			{#if event.group}
				<div>
					<p
						class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
					>
						Group
					</p>
					<p class="text-base-900 dark:text-base-50 text-sm font-medium">
						{event.group.name}
					</p>
					<p class="text-base-500 text-xs">Your role: {event.group.role}</p>
				</div>
			{/if}

			<!-- Attendees -->
			{#if event.attendees && event.attendees.length > 0}
				<div>
					<p
						class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
					>
						Attendees
					</p>
					<div class="space-y-2">
						{#each event.attendees as attendee (attendee.did || attendee.name)}
							{#if attendee.url}
								<a
									href={attendee.url}
									class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium transition-opacity hover:opacity-80"
								>
									<FoxAvatar
										src={attendee.avatar}
										alt={attendee.name || attendee.handle || attendee.did}
										class="size-8 shrink-0"
									/>
									<div class="min-w-0">
										<span class="truncate text-sm">{attendee.name || attendee.handle || attendee.did}</span>
										{#if attendee.role && attendee.role !== 'participant'}
											<span class="text-base-500 dark:text-base-400 ml-1 text-xs">
												({attendee.role})
											</span>
										{/if}
									</div>
								</a>
							{:else}
								<div
									class="text-base-900 dark:text-base-100 flex items-center gap-2.5 font-medium"
								>
									<FoxAvatar
										src={attendee.avatar}
										alt={attendee.name || 'Attendee'}
										class="size-8 shrink-0"
									/>
									<div class="min-w-0">
										<span class="truncate text-sm">{attendee.name || 'Attendee'}</span>
										{#if attendee.role && attendee.role !== 'participant'}
											<span class="text-base-500 dark:text-base-400 ml-1 text-xs">
												({attendee.role})
											</span>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
						{#if event.attendeesCount > event.attendees.length}
							<p class="text-base-500 dark:text-base-400 text-xs">
								+{event.attendeesCount - event.attendees.length} more
							</p>
						{/if}
					</div>
				</div>
			{/if}
		{/snippet}
	</EventDetail>
{:else}
	<div class="px-6 py-24 text-center">
		{#if data.state === 'unauthenticated'}
			<p class="text-base-500 dark:text-base-400">Sign in to see non-public events.</p>
		{:else}
			<p class="text-base-500 dark:text-base-400">
				This event doesn't exist or you don't have access.
			</p>
		{/if}
	</div>
{/if}
