<script lang="ts">
	import { Button, ToggleGroup, ToggleGroupItem } from '@foxui/core';
	import { onMount } from 'svelte';
	import DaySchedule from './DaySchedule.svelte';
	import {
		type ScheduleEvent,
		getDayKey,
		getDayLabel,
		getDayShortLabel,
		getRooms,
		buildGrid,
		isoToMinutes
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
