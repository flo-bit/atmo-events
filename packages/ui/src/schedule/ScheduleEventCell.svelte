<script lang="ts">
	import {
		type GridEvent,
		linkableTypes,
		isCompact,
		getEventColor,
		formatTime
	} from './schedule-utils.js';
	import { Check, Star, Video } from '@sketchyicons/svelte';
	import { Modal, Button, Icon } from '@atmo-dev/kit';
	import EventRsvp from '../EventRsvp.svelte';
	import VodPlayer from '../VodPlayer.svelte';
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';
	import type { Snippet } from 'svelte';

	let {
		event,
		tz,
		eventActor,
		adapter,
		viewer,
		rsvpStatuses = {},
		rsvpRkeys = {},
		vodPlaylistUrl,
		vodSubtitlesUrl,
		onrsvpchange,
		trigger
	}: {
		event: GridEvent;
		/** Timezone the schedule is laid out in. */
		tz: string;
		/** Handle/DID used to build the talk's event-page link. */
		eventActor: string;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		rsvpStatuses?: Record<string, string>;
		rsvpRkeys?: Record<string, string>;
		vodPlaylistUrl?: string;
		vodSubtitlesUrl?: string;
		onrsvpchange?: (uri: string, status: string | null, rkey?: string) => void;
		/** Custom clickable trigger; receives `open` to launch the modal. Defaults
		 *  to the standard colored grid-cell button. */
		trigger?: Snippet<[{ open: () => void }]>;
	} = $props();

	let modalOpen = $state(false);

	let durationMin = $derived(event.endMin - event.startMin);
	let compact = $derived(isCompact(durationMin, event.type));
	let initialRsvpStatus = $derived(
		(rsvpStatuses[event.uri] as 'going' | 'interested' | 'notgoing' | undefined) ?? null
	);
	let initialRsvpRkey = $derived(rsvpRkeys[event.uri] ?? null);
	let isPast = $derived(event.end ? new Date(event.end) < new Date() : false);
	let eventHref = $derived(`/p/${eventActor}/e/${event.rkey}`);
</script>

{#if linkableTypes.has(event.type) && event.rkey}
	{#if trigger}
		{@render trigger({ open: () => (modalOpen = true) })}
	{:else}
		<button
			onclick={() => (modalOpen = true)}
			class="relative flex-1 cursor-pointer overflow-hidden rounded-md leading-tight transition-[filter] hover:brightness-95 {getEventColor(
				event.type
			)} {event.type === 'info'
				? 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
				: ''} {compact ? 'px-1.5 py-0 text-[0.6rem]' : 'px-2 py-1.5 text-xs'}"
		>
			<p class="font-semibold {durationMin <= 30 ? 'line-clamp-1' : ''}">
				{event.title}
			</p>
			{#if event.speakers?.length && !compact}
				<p class="mt-0.5 opacity-75 {durationMin < 60 ? 'line-clamp-1' : ''}">
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
	{/if}

	<Modal bind:open={modalOpen} title={event.title}>
		<div class="overflow-hidden">
			{#if event.start}
				<p class="text-muted mt-1 text-sm">
					{formatTime(event.start, tz)}{event.end ? ` – ${formatTime(event.end, tz)}` : ''}
				</p>
			{/if}

			{#if event.speakers?.length}
				<p class="text-base-600 dark:text-base-300 mt-1 text-sm">
					{#each event.speakers as s, i (s.id ?? s.name)}{#if s.id}<a
								href="https://bsky.app/profile/{s.id}"
								target="_blank"
								rel="noopener noreferrer"
								class="text-accent-600 dark:text-accent-400 hover:underline">{s.name}</a
							>{:else}{s.name}{/if}{#if i < event.speakers.length - 1},
						{/if}{/each}
				</p>
			{/if}

			{#if event.description}
				<p class="text-muted mt-3 line-clamp-3 text-sm break-words">
					{event.description}
				</p>
			{/if}

			{#if !isPast}
				<EventRsvp
					eventUri={event.uri}
					eventCid={event.cid ?? null}
					rsvpExpected={event.rsvpExpected}
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
						subtitlesUrl={vodSubtitlesUrl}
					/>
				</div>
			{/if}
			<Button href={eventHref} variant="secondary" class="mt-2 w-full">Go to event</Button>
		</div>
	</Modal>
{:else}
	<div
		class="flex-1 overflow-hidden rounded-md leading-tight {getEventColor(
			event.type
		)} {event.type === 'info'
			? durationMin <= 30
				? 'flex items-center justify-center gap-2 px-2 py-0.5 text-center text-xs'
				: 'flex flex-col items-center justify-center px-2 py-1.5 text-center text-xs'
			: ''} {compact ? 'px-1.5 py-0 text-[0.6rem]' : 'px-2 py-1.5 text-xs'}"
	>
		<p class="font-semibold {durationMin <= 30 ? 'line-clamp-1' : ''}">
			{event.title}
		</p>
		{#if event.start}
			<p class="{durationMin <= 30 ? '' : 'mt-0.5'} shrink-0 opacity-75">
				{formatTime(event.start, tz)}{event.end ? ` – ${formatTime(event.end, tz)}` : ''}
			</p>
		{/if}
	</div>
{/if}
