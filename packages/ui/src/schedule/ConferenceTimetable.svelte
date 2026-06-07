<script lang="ts">
	import { Button, ToggleGroup, ToggleGroupItem } from '@foxui/core';
	import { onMount } from 'svelte';
	import DaySchedule from './DaySchedule.svelte';
	import ScheduleEventCell from './ScheduleEventCell.svelte';
	import {
		type ScheduleEvent,
		type GridEvent,
		getDayKey,
		getDayLabel,
		getDayShortLabel,
		getRooms,
		buildGrid,
		isoToMinutes,
		formatTime
	} from './schedule-utils.js';
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';

	type VodInfo = { playlistUrl: string; subtitlesUrl?: string };

	let {
		scheduleEvents,
		tz,
		eventActor,
		adapter,
		viewer,
		rooms: explicitRooms,
		rsvpStatuses: initialRsvpStatuses = {},
		rsvpRkeys: initialRsvpRkeys = {},
		eventVods = {},
		loggedIn = false
	}: {
		scheduleEvents: ScheduleEvent[];
		tz: string;
		eventActor: string;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		/** Explicit room ordering from the conference event, if declared. */
		rooms?: string[];
		rsvpStatuses?: Record<string, string>;
		rsvpRkeys?: Record<string, string>;
		eventVods?: Record<string, VodInfo>;
		loggedIn?: boolean;
	} = $props();

	// Own a mutable copy so RSVPs made from the grid reflect immediately.
	let rsvpStatuses = $state({ ...initialRsvpStatuses });
	let rsvpRkeys = $state({ ...initialRsvpRkeys });

	let filterMode = $state('all');
	let selectedDay = $state('all');
	let activeRooms: Record<number, number> = $state({});

	let now = $state(new Date());
	onMount(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => clearInterval(interval);
	});

	let nowIso = $derived(now.toISOString());
	let nowKey = $derived(getDayKey(nowIso, tz));
	let nowMinutes = $derived(isoToMinutes(nowIso, tz));

	let dayGroups = $derived.by(() => {
		const groups = new Map<
			string,
			{ key: string; label: string; shortLabel: string; events: ScheduleEvent[] }
		>();
		for (const event of scheduleEvents) {
			const key = getDayKey(event.start, tz);
			if (!groups.has(key)) {
				groups.set(key, {
					key,
					label: getDayLabel(event.start, tz),
					shortLabel: getDayShortLabel(event.start, tz),
					events: []
				});
			}
			groups.get(key)!.events.push(event);
		}
		return [...groups.values()];
	});

	let filteredDayGroups = $derived(
		selectedDay === 'all' ? dayGroups : dayGroups.filter((d) => d.key === selectedDay)
	);

	let isDuringConference = $derived.by(() => {
		if (scheduleEvents.length === 0) return false;
		const first = scheduleEvents[0].start;
		const last = scheduleEvents[scheduleEvents.length - 1];
		const lastEnd = last.end || last.start;
		return now >= new Date(first) && now <= new Date(lastEnd);
	});

	// The viewer's RSVP'd talks (going/interested) that haven't ended yet, shown
	// a few at a time via "Show more".
	let visibleCount = $state(3);
	let upNextAll = $derived.by(() => {
		if (!loggedIn) return [];
		const nowMs = now.getTime();
		return scheduleEvents
			.filter((e) => {
				const status = rsvpStatuses[e.uri];
				if (status !== 'going' && status !== 'interested') return false;
				const endMs = new Date(e.end ?? e.start).getTime();
				return endMs >= nowMs;
			})
			.sort((a, b) => a.start.localeCompare(b.start));
	});
	let upNext = $derived(upNextAll.slice(0, visibleCount));

	function whenLabel(ev: ScheduleEvent): { text: string; soon: boolean } {
		const start = new Date(ev.start);
		const end = new Date(ev.end ?? ev.start);
		if (now >= start && now <= end) return { text: 'Now', soon: true };
		const diffMin = Math.round((start.getTime() - now.getTime()) / 60_000);
		if (diffMin >= 0 && diffMin < 60) return { text: `in ${diffMin} min`, soon: true };
		const time = formatTime(ev.start, tz);
		const sameDay = getDayKey(ev.start, tz) === nowKey;
		return { text: sameDay ? time : `${getDayShortLabel(ev.start, tz)} ${time}`, soon: false };
	}

	function subtitle(ev: ScheduleEvent): string {
		return [
			ev.room && ev.room !== 'none' ? ev.room : null,
			ev.speakers?.length ? ev.speakers.map((s) => s.name).join(', ') : null
		]
			.filter(Boolean)
			.join(' · ');
	}

	// Wrap a schedule event as a GridEvent so ScheduleEventCell can own its modal
	// (the layout fields are unused; only the start/end-minute span matters).
	function toGridEvent(ev: ScheduleEvent): GridEvent {
		const durMin = ev.end
			? Math.max(0, Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000))
			: 30;
		return {
			...ev,
			startMin: 0,
			endMin: durMin,
			startRow: 1,
			spanRows: 1,
			colStart: 1,
			colSpan: 1,
			zIndex: 0
		};
	}

	let tzLabel = $derived.by(() => {
		try {
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: tz,
				timeZoneName: 'short'
			}).formatToParts(now);
			return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
		} catch {
			return tz;
		}
	});

	function handleRsvpChange(uri: string, status: string | null, rkey?: string) {
		if (status) {
			rsvpStatuses = { ...rsvpStatuses, [uri]: status };
			if (rkey) rsvpRkeys = { ...rsvpRkeys, [uri]: rkey };
		} else {
			const { [uri]: _, ...rest } = rsvpStatuses;
			rsvpStatuses = rest;
			const { [uri]: __, ...restKeys } = rsvpRkeys;
			rsvpRkeys = restKeys;
		}
	}

	function scrollToNow() {
		const els = document.querySelectorAll('[data-now-line]');
		for (const el of els) {
			if (el instanceof HTMLElement && el.offsetParent !== null) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				return;
			}
		}
		els[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

{#if scheduleEvents.length > 0}
	<div class="mt-8 mb-6 flex items-center justify-between">
		<h2 class="text-base-900 dark:text-base-50 text-2xl font-bold">Schedule</h2>
		{#if isDuringConference}
			<Button onclick={scrollToNow} size="sm">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="size-4"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
				</svg>
				Jump to now
			</Button>
		{/if}
	</div>

	<p class="text-base-500 dark:text-base-400 mb-4 text-sm">All times shown in {tzLabel}.</p>

	{#if upNextAll.length > 0}
		<div class="mb-8">
			<h2 class="text-base-900 dark:text-base-50 mb-3 text-xl font-bold">Up next</h2>
			<div class="space-y-2">
				{#each upNext as ev (ev.uri)}
					{@const w = whenLabel(ev)}
					<ScheduleEventCell
						event={toGridEvent(ev)}
						{tz}
						{eventActor}
						{adapter}
						{viewer}
						{rsvpStatuses}
						{rsvpRkeys}
						vodPlaylistUrl={eventVods[ev.uri]?.playlistUrl}
						vodSubtitlesUrl={eventVods[ev.uri]?.subtitlesUrl}
						onrsvpchange={handleRsvpChange}
					>
						{#snippet trigger({ open })}
							<button
								onclick={open}
								class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 hover:border-base-300 dark:hover:border-base-700 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left leading-tight transition-colors"
							>
								<div class="min-w-0 flex-1">
									<p class="text-base-900 dark:text-base-100 truncate text-sm font-semibold">
										{ev.title}
									</p>
									{#if subtitle(ev)}
										<p class="text-base-500 dark:text-base-400 mt-0.5 truncate text-xs">
											{subtitle(ev)}
										</p>
									{/if}
								</div>
								<span
									class="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap {w.soon
										? 'text-accent-600 dark:text-accent-400 font-semibold'
										: 'text-base-500 dark:text-base-400'}"
								>
									{#if rsvpStatuses[ev.uri] === 'going'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="size-3.5 text-green-500"
										>
											<path
												fill-rule="evenodd"
												d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
												clip-rule="evenodd"
											/>
										</svg>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="size-3.5 text-amber-500"
										>
											<path
												fill-rule="evenodd"
												d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
												clip-rule="evenodd"
											/>
										</svg>
									{/if}
									{w.text}
								</span>
							</button>
						{/snippet}
					</ScheduleEventCell>
				{/each}
			</div>
			{#if upNextAll.length > upNext.length}
				<button
					type="button"
					onclick={() => (visibleCount += 5)}
					class="text-accent-600 dark:text-accent-400 mt-2 text-sm font-medium hover:underline"
				>
					Show more
				</button>
			{/if}
		</div>
	{/if}

	{#if dayGroups.length > 1 || loggedIn}
	<div class="mb-6 space-y-3">
		{#if dayGroups.length > 1}
			<div class="flex items-center gap-3">
				<span class="text-base-500 dark:text-base-400 w-14 text-xs">Days</span>
				<ToggleGroup
					type="single"
					bind:value={() => selectedDay, (v) => { if (v) selectedDay = v; }}
					class="w-fit"
				>
					<ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
					{#each dayGroups as day (day.key)}
						<ToggleGroupItem value={day.key} size="sm">{day.shortLabel}</ToggleGroupItem>
					{/each}
				</ToggleGroup>
			</div>
		{/if}
		{#if loggedIn}
			<div class="flex items-center gap-3">
				<span class="text-base-500 dark:text-base-400 w-14 text-xs">Events</span>
				<ToggleGroup
					type="single"
					bind:value={() => filterMode, (v) => { if (v) filterMode = v; }}
					class="w-fit"
				>
					<ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
					<ToggleGroupItem value="attending" size="sm">Attending</ToggleGroupItem>
				</ToggleGroup>
			</div>
		{/if}
	</div>
	{/if}

	{#each filteredDayGroups as day, dayIndex (day.key)}
		{@const dayRooms = getRooms(day.events, explicitRooms)}
		{@const grid = buildGrid(day.events, dayRooms, tz)}

		<section class="isolate mb-12">
			<h3 class="text-base-900 dark:text-base-50 mb-4 text-lg font-bold">{day.label}</h3>
			<DaySchedule
				{grid}
				rooms={dayRooms}
				dayEvents={day.events}
				{tz}
				{eventActor}
				{adapter}
				{viewer}
				bind:activeRoom={() => activeRooms[dayIndex] ?? 0, (v) => (activeRooms[dayIndex] = v)}
				{nowKey}
				{nowMinutes}
				{rsvpStatuses}
				{rsvpRkeys}
				{eventVods}
				dimUnattended={filterMode === 'attending'}
				onrsvpchange={handleRsvpChange}
			/>
		</section>
	{/each}
{/if}
