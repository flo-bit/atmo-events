<script lang="ts">
	import {
		type GridEvent,
		linkableTypes,
		isCompact,
		getEventColor,
		durationMinutes,
		formatTime
	} from './schedule-utils';
	import { Modal, Button } from '@foxui/core';
	import EventRsvp from '$lib/components/EventRsvp.svelte';
	import VodPlayer from '$lib/components/VodPlayer.svelte';

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

	let initialRsvpStatus = $derived((rsvpStatuses[event.uri] as 'going' | 'interested' | 'notgoing' | undefined) ?? null);
	let initialRsvpRkey = $derived(rsvpRkeys[event.uri] ?? null);
	let isPast = $derived(event.end ? new Date(event.end) < new Date() : false);
</script>

{#if linkableTypes.has(event.type) && event.rkey}
	<button
		onclick={() => (modalOpen = true)}
		class="relative cursor-pointer flex-1 overflow-hidden rounded-md leading-tight transition-[filter] hover:brightness-95 {getEventColor(
			event.type
		)} {event.type === 'info'
			? 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
			: ''} {isCompact(event.type, event.start, event.end) ? 'px-1.5 py-0 text-[0.6rem]' : 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMinutes(event.start, event.end) <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.speakers?.length && !isCompact(event.type, event.start, event.end)}
			<p class="mt-0.5 opacity-75 {durationMinutes(event.start, event.end) < 60 ? 'line-clamp-1' : ''}">{event.speakers.map((s) => s.name).join(', ')}</p>
		{/if}
		{#if vodPlaylistUrl}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="absolute top-1 right-1 size-3 opacity-60">
				<path d="M3.25 4A2.25 2.25 0 0 0 1 6.25v7.5A2.25 2.25 0 0 0 3.25 16h7.5A2.25 2.25 0 0 0 13 13.75v-1.956l3.203 1.602A.75.75 0 0 0 17.25 12.75v-5.5a.75.75 0 0 0-1.047-.646L13 8.206V6.25A2.25 2.25 0 0 0 10.75 4h-7.5Z" />
			</svg>
		{/if}
		{#if initialRsvpStatus === 'going'}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="absolute right-1 bottom-1 size-3 opacity-60">
				<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
			</svg>
		{:else if initialRsvpStatus === 'interested'}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="absolute right-1 bottom-1 size-3 opacity-60">
				<path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" />
			</svg>
		{/if}
	</button>

	<Modal bind:open={modalOpen}>
		<div class="overflow-hidden">
			<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold break-words">{event.title}</h2>

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
				<p class="text-base-500 dark:text-base-400 mt-3 line-clamp-3 break-words text-sm">{event.description}</p>
			{/if}

			{#if !isPast}
				<EventRsvp
					eventUri={event.uri}
					eventCid={event.cid ?? null}
					{initialRsvpStatus}
					{initialRsvpRkey}
					onlogin={() => (modalOpen = false)}
					onrsvp={(status, key) => { onrsvpchange?.(event.uri, status, key); modalOpen = false; }}
					oncancel={() => { onrsvpchange?.(event.uri, null); }}
				/>
			{/if}

			{#if vodPlaylistUrl}
				<div class="mt-3">
					<VodPlayer playlistUrl={vodPlaylistUrl} title={event.title} />
				</div>
			{/if}
			<Button href="/p/atmosphereconf.org/e/{event.rkey}" variant="secondary" class="mt-2 w-full">Go to event</Button>
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
			: ''} {isCompact(event.type, event.start, event.end) ? 'px-1.5 py-0 text-[0.6rem]' : 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMinutes(event.start, event.end) <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.start}
			<p class="{durationMinutes(event.start, event.end) <= 30 ? '' : 'mt-0.5'} opacity-75 shrink-0">
				{formatTime(event.start)}{event.end ? ` – ${formatTime(event.end)}` : ''}
			</p>
		{/if}
	</div>
{/if}
