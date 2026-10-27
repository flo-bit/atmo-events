<script lang="ts">
	import {
		type GridEvent,
		linkableTypes,
		isCompact,
		getEventColor,
		durationMinutes,
		formatTime
	} from './schedule-utils';
	import { Check, Star, Video } from '@sketchyicons/svelte';
	import { Modal, Button, Icon } from '@atmo-dev/kit';
	import { EventRsvp } from '@atmo-dev/events-ui';
	import { VodPlayer } from '@atmo-dev/events-ui';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));

	let {
		event,
		rsvpStatuses = {},
		rsvpRkeys = {},
		loggedIn = false,
		vodPlaylistUrl,
		onrsvpchange
	}: {
		event: GridEvent;
		rsvpStatuses?: Record<string, string>;
		rsvpRkeys?: Record<string, string>;
		loggedIn?: boolean;
		vodPlaylistUrl?: string;
		onrsvpchange?: (uri: string, status: string | null, rkey?: string) => void;
	} = $props();

	let modalOpen = $state(false);

	let initialRsvpStatus = $derived(
		(rsvpStatuses[event.uri] as 'going' | 'interested' | 'notgoing' | undefined) ?? null
	);
	let initialRsvpRkey = $derived(rsvpRkeys[event.uri] ?? null);
	let isPast = $derived(event.end ? new Date(event.end) < new Date() : false);
</script>

{#if linkableTypes.has(event.type) && event.rkey}
	<button
		onclick={() => (modalOpen = true)}
		class="relative flex-1 cursor-pointer overflow-hidden rounded-md leading-tight transition-[filter] hover:brightness-95 {getEventColor(
			event.type
		)} {event.type === 'info'
			? 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
			: ''} {isCompact(event.type, event.start, event.end)
			? 'px-1.5 py-0 text-[0.6rem]'
			: 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMinutes(event.start, event.end) <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.speakers?.length && !isCompact(event.type, event.start, event.end)}
			<p
				class="mt-0.5 opacity-75 {durationMinutes(event.start, event.end) < 60
					? 'line-clamp-1'
					: ''}"
			>
				{event.speakers.map((s) => s.name).join(', ')}
			</p>
		{/if}
		{#if vodPlaylistUrl}
			<Icon img={Video} size={12} class="absolute top-1 right-1 opacity-60" />
		{/if}
		{#if initialRsvpStatus === 'going'}
			<Icon img={Check} size={12} class="absolute right-1 bottom-1 opacity-60" />
		{:else if initialRsvpStatus === 'interested'}
			<Icon img={Star} size={12} class="absolute right-1 bottom-1 opacity-60" />
		{/if}
	</button>

	<Modal bind:open={modalOpen} title={event.title}>
		<div class="overflow-hidden">
			{#if event.start}
				<p class="text-base-500 dark:text-base-400 mt-1 text-sm">
					{formatTime(event.start)}{event.end ? ` – ${formatTime(event.end)}` : ''}
				</p>
			{/if}

			{#if event.speakers?.length}
				<p class="text-base-600 dark:text-base-300 mt-1 text-sm">
					{event.speakers.map((s) => s.name).join(', ')}
				</p>
			{/if}

			{#if event.description}
				<p class="text-base-500 dark:text-base-400 mt-3 line-clamp-3 text-sm break-words">
					{event.description}
				</p>
			{/if}

			{#if !isPast}
				<EventRsvp
					eventUri={event.uri}
					eventCid={event.cid ?? null}
					{initialRsvpStatus}
					{initialRsvpRkey}
					{adapter}
					{viewer}
					onlogin={() => (modalOpen = false)}
					onrsvp={(status, key) => {
						onrsvpchange?.(event.uri, status, key);
						modalOpen = false;
					}}
					oncancel={() => {
						onrsvpchange?.(event.uri, null);
					}}
				/>
			{/if}

			{#if vodPlaylistUrl}
				<div class="mt-3">
					<VodPlayer
						playlistUrl={vodPlaylistUrl}
						title={event.title}
						subtitlesUrl="/vods/{event.rkey}-karaoke.vtt"
					/>
				</div>
			{/if}
			<Button href="/p/atmosphereconf.org/e/{event.rkey}" variant="secondary" class="mt-2 w-full"
				>Go to event</Button
			>
		</div>
	</Modal>
{:else}
	<div
		class="flex-1 overflow-hidden rounded-md leading-tight {getEventColor(
			event.type
		)} {event.type === 'info'
			? durationMinutes(event.start, event.end) <= 30
				? 'flex items-center justify-center gap-2 px-2 py-0.5 text-center text-xs'
				: 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
			: ''} {isCompact(event.type, event.start, event.end)
			? 'px-1.5 py-0 text-[0.6rem]'
			: 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMinutes(event.start, event.end) <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.start}
			<p
				class="{durationMinutes(event.start, event.end) <= 30 ? '' : 'mt-0.5'} shrink-0 opacity-75"
			>
				{formatTime(event.start)}{event.end ? ` – ${formatTime(event.end)}` : ''}
			</p>
		{/if}
	</div>
{/if}
