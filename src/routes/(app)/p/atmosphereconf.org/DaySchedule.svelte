<script lang="ts">
	import ScheduleEventCell from './ScheduleEventCell.svelte';
	import {
		type ScheduleEvent,
		type GridData,
		SLOT,
		linkableTypes,
		formatHour,
		getDayKey,
		getNowGridRow
	} from './schedule-utils';

	import type { VodRecord } from '$lib/vods';

	let {
		grid,
		rooms,
		dayIndex,
		dayEvents,
		activeRoom = $bindable(0),
		nowVancouverKey,
		nowVancouverMinutes,
		rsvpStatuses = {},
		rsvpRkeys = {},
		eventVods = {},
		dimUnattended = false,
		dimUnrecorded = false,
		loggedIn = false,
		onrsvpchange
	}: {
		grid: GridData;
		rooms: string[];
		dayIndex: number;
		dayEvents: ScheduleEvent[];
		activeRoom: number;
		nowVancouverKey: string;
		nowVancouverMinutes: number;
		rsvpStatuses?: Record<string, string>;
		rsvpRkeys?: Record<string, string>;
		eventVods?: Record<string, VodRecord>;
		dimUnattended?: boolean;
		dimUnrecorded?: boolean;
		loggedIn?: boolean;
		onrsvpchange?: (uri: string, status: string | null, rkey?: string) => void;
	} = $props();

	let dayKey = $derived(dayEvents[0]?.start ? getDayKey(dayEvents[0].start) : '');
	let nowRow = $derived(getNowGridRow(grid, dayKey, nowVancouverKey, nowVancouverMinutes));

	function isDimmed(event: { did: string; rkey: string; type: string }): boolean {
		if (dimUnrecorded) {
			if (event.type === 'info') return true;
			const uri = `at://${event.did}/community.lexicon.calendar.event/${event.rkey}`;
			return !eventVods[uri];
		}
		if (dimUnattended) {
			if (event.type === 'info') return true;
			const uri = `at://${event.did}/community.lexicon.calendar.event/${event.rkey}`;
			const status = rsvpStatuses[uri];
			return !status || status === 'notgoing';
		}
		return false;
	}
</script>

<div
	class="border-base-200 dark:border-base-800 bg-base-100/60 dark:bg-base-950/50 overflow-hidden rounded-xl border"
>
	<!-- Mobile: room tabs -->
	<div
		class="border-base-200 dark:border-base-800 divide-base-200 dark:divide-base-800 flex flex-col divide-y border-b md:hidden"
	>
		{#each rooms as room, i}
			<button
				class="flex-1 px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-colors
					{activeRoom === i
					? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300'
					: 'text-base-500 dark:text-base-400'}"
				onclick={() => (activeRoom = i)}
			>
				{room}
			</button>
		{/each}
	</div>

	<!-- Mobile: single room view -->
	{#each rooms as room, roomIndex}
		{@const roomEvents = grid.gridEvents.filter((e) => e.type === 'info' || e.room === room)}
		<div class="md:hidden {activeRoom !== roomIndex ? 'hidden' : ''}">
			<div class="flex">
				<div class="border-base-200 dark:border-base-800 w-14 shrink-0 border-r"></div>
				<div class="relative grid flex-auto grid-cols-1 grid-rows-1">
					<div
						class="divide-base-200/40 dark:divide-base-800/40 col-start-1 col-end-2 row-start-1 grid divide-y"
						style={grid.timeGridRows}
					>
						<div></div>
						<div></div>
						{#each Array(grid.totalSlots) as _, i}
							<div>
								{#if (grid.minTime + i * SLOT) % 60 === 0}
									<div
										class="text-base-400 dark:text-base-500 sticky left-0 z-20 -mt-2 -ml-14 w-14 pr-2 text-right text-[0.65rem] leading-none"
									>
										{formatHour(grid.minTime + i * SLOT)}
									</div>
								{/if}
							</div>
						{/each}
					</div>
					<ol
						class="divide-base-200/40 dark:divide-base-800/40 col-start-1 col-end-2 row-start-1 grid divide-y"
						style="grid-template-columns: 1fr; {grid.timeGridRows}"
					>
						{#each roomEvents as event}
							<li
								class="relative flex min-h-5 p-0.5 transition-opacity {isDimmed(event) ? (linkableTypes.has(event.type) && event.rkey ? 'opacity-30 hover:opacity-80' : 'opacity-30') : ''}"
								style="grid-row: {event.startRow} / span {event.spanRows}; grid-column: 1; z-index: {event.zIndex}"
							>
								<ScheduleEventCell {event} {rsvpStatuses} {rsvpRkeys} {loggedIn} vodPlaylistUrl={eventVods[event.uri]?.playlistUrl} {onrsvpchange} />
							</li>
						{/each}
						{#if nowRow}
							<li
								data-now-line
								class="pointer-events-none relative"
								style="z-index: 9999; grid-row: {nowRow.row}; grid-column: 1"
							>
								<div class="absolute inset-x-0 flex items-center" style="top: {nowRow.offsetPercent}%">
									<div class="size-2 rounded-full bg-red-500"></div>
									<div class="h-0.5 flex-1 bg-red-500"></div>
								</div>
							</li>
						{/if}
					</ol>
				</div>
			</div>
		</div>
	{/each}

	<!-- Desktop: full grid -->
	<div class="hidden overflow-x-auto md:block">
		<div style="min-width: {rooms.length * 10 + 4}rem">
			<div
				class="border-base-200 dark:border-base-800 bg-base-100/60 dark:bg-base-950/50 flex border-b"
			>
				<div class="border-base-200 dark:border-base-800 w-14 shrink-0 border-r"></div>
				<div
					class="divide-base-200 dark:divide-base-800 grid flex-auto divide-x"
					style="grid-template-columns: repeat({rooms.length}, minmax(0, 1fr))"
				>
					{#each rooms as room}
						<div
							class="text-base-500 dark:text-base-400 px-2 py-2.5 text-center text-xs font-semibold tracking-wide uppercase"
						>
							{room}
						</div>
					{/each}
				</div>
			</div>

			<div class="flex">
				<div class="border-base-200 dark:border-base-800 w-14 shrink-0 border-r"></div>
				<div class="relative grid flex-auto grid-cols-1 grid-rows-1">
					<div
						class="divide-base-200/40 dark:divide-base-800/40 col-start-1 col-end-2 row-start-1 grid divide-y"
						style={grid.timeGridRows}
					>
						<div></div>
						<div></div>
						{#each Array(grid.totalSlots) as _, i}
							<div>
								{#if (grid.minTime + i * SLOT) % 60 === 0}
									<div
										class="text-base-400 dark:text-base-500 sticky left-0 z-20 -mt-2 -ml-14 w-14 pr-2 text-right text-[0.65rem] leading-none"
									>
										{formatHour(grid.minTime + i * SLOT)}
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<div
						class="divide-base-200/40 dark:divide-base-800/40 col-start-1 col-end-2 row-start-1 grid grid-rows-1 divide-x"
						style="grid-template-columns: repeat({rooms.length}, minmax(0, 1fr))"
					>
						{#each rooms as _}
							<div class="row-span-full"></div>
						{/each}
					</div>

					<ol
						class="divide-base-200/40 dark:divide-base-800/40 col-start-1 col-end-2 row-start-1 grid divide-y"
						style="grid-template-columns: repeat({rooms.length}, minmax(0, 1fr)); {grid.timeGridRows}"
					>
						{#each grid.gridEvents as event}
							<li
								class="relative flex min-h-5 p-0.5 transition-opacity {isDimmed(event) ? (linkableTypes.has(event.type) && event.rkey ? 'opacity-30 hover:opacity-80' : 'opacity-30') : ''}"
								style="grid-row: {event.startRow} / span {event.spanRows}; grid-column: {event.colStart} / span {event.colSpan}; z-index: {event.zIndex}"
							>
								<ScheduleEventCell {event} {rsvpStatuses} {rsvpRkeys} {loggedIn} vodPlaylistUrl={eventVods[event.uri]?.playlistUrl} {onrsvpchange} />
							</li>
						{/each}
						{#if nowRow}
							<li
								data-now-line
								class="pointer-events-none relative"
								style="z-index: 9999; grid-row: {nowRow.row}; grid-column: 1 / span {rooms.length}"
							>
								<div class="absolute inset-x-0 flex items-center" style="top: {nowRow.offsetPercent}%">
									<div class="size-2 rounded-full bg-red-500"></div>
									<div class="h-0.5 flex-1 bg-red-500"></div>
								</div>
							</li>
						{/if}
					</ol>
				</div>
			</div>
		</div>
	</div>
</div>
