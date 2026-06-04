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
	} from './schedule-utils.js';
	import type { EditorAdapter, EditorViewer } from '../editor/adapter.js';

	type VodInfo = { playlistUrl: string; subtitlesUrl?: string };

	let {
		grid,
		rooms,
		dayEvents,
		tz,
		eventActor,
		adapter,
		viewer,
		activeRoom = $bindable(0),
		nowKey,
		nowMinutes,
		rsvpStatuses = {},
		rsvpRkeys = {},
		eventVods = {},
		dimUnattended = false,
		onrsvpchange
	}: {
		grid: GridData;
		rooms: string[];
		dayEvents: ScheduleEvent[];
		tz: string;
		eventActor: string;
		adapter: EditorAdapter;
		viewer: EditorViewer;
		activeRoom: number;
		nowKey: string;
		nowMinutes: number;
		rsvpStatuses?: Record<string, string>;
		rsvpRkeys?: Record<string, string>;
		eventVods?: Record<string, VodInfo>;
		dimUnattended?: boolean;
		onrsvpchange?: (uri: string, status: string | null, rkey?: string) => void;
	} = $props();

	let dayKey = $derived(dayEvents[0]?.start ? getDayKey(dayEvents[0].start, tz) : '');
	let nowRow = $derived(getNowGridRow(grid, dayKey, nowKey, nowMinutes));

	// Mobile shows one room at a time, picked from a dropdown (there can be many).
	let roomMenuOpen = $state(false);

	function isDimmed(event: { uri: string; type: string }): boolean {
		if (dimUnattended) {
			if (event.type === 'info') return true;
			const status = rsvpStatuses[event.uri];
			return !status || status === 'notgoing';
		}
		return false;
	}
</script>

<div
	class="border-base-200 dark:border-base-800 bg-base-100/60 dark:bg-base-950/50 overflow-hidden rounded-xl border"
>
	<!-- Mobile: room selector (one room shown at a time) -->
	<div class="border-base-200 dark:border-base-800 relative border-b md:hidden">
		<button
			type="button"
			onclick={() => (roomMenuOpen = !roomMenuOpen)}
			class="flex w-full items-center justify-between gap-2 px-3 py-2.5"
		>
			<span
				class="text-accent-700 dark:text-accent-300 truncate text-xs font-semibold tracking-wide uppercase"
			>
				{rooms[activeRoom] ?? ''}
			</span>
			<span class="text-base-400 dark:text-base-500 flex shrink-0 items-center gap-2">
				<span class="text-xs tabular-nums">{activeRoom + 1}/{rooms.length}</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="size-4 transition-transform {roomMenuOpen ? 'rotate-180' : ''}"
				>
					<path
						fill-rule="evenodd"
						d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
						clip-rule="evenodd"
					/>
				</svg>
			</span>
		</button>
		{#if roomMenuOpen}
			<button
				type="button"
				class="fixed inset-0 z-[9990] cursor-default"
				aria-label="Close room menu"
				onclick={() => (roomMenuOpen = false)}
			></button>
			<ul
				class="border-base-200 dark:border-base-800 bg-base-50 dark:bg-base-900 absolute inset-x-0 top-full z-[10000] max-h-64 overflow-auto border-b shadow-lg"
			>
				{#each rooms as room, i (room)}
					<li>
						<button
							type="button"
							onclick={() => {
								activeRoom = i;
								roomMenuOpen = false;
							}}
							class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors {activeRoom ===
							i
								? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-semibold'
								: 'text-base-600 dark:text-base-300'}"
						>
							<span class="truncate">{room}</span>
							{#if activeRoom === i}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="size-4 shrink-0"
								>
									<path
										fill-rule="evenodd"
										d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
										clip-rule="evenodd"
									/>
								</svg>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
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
										class="text-base-400 dark:text-base-500 sticky left-0 z-[1500] -mt-2 -ml-14 w-14 pr-2 text-right text-[0.65rem] leading-none"
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
								class="relative flex min-h-5 p-0.5 transition-opacity {isDimmed(event)
									? linkableTypes.has(event.type) && event.rkey
										? 'opacity-30 hover:opacity-80'
										: 'opacity-30'
									: ''}"
								style="grid-row: {event.startRow} / span {event.spanRows}; grid-column: 1; z-index: {event.zIndex}"
							>
								<ScheduleEventCell
									{event}
									{tz}
									{eventActor}
									{adapter}
									{viewer}
									{rsvpStatuses}
									{rsvpRkeys}
									vodPlaylistUrl={eventVods[event.uri]?.playlistUrl}
									vodSubtitlesUrl={eventVods[event.uri]?.subtitlesUrl}
									{onrsvpchange}
								/>
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
										class="text-base-400 dark:text-base-500 sticky left-0 z-[1500] -mt-2 -ml-14 w-14 pr-2 text-right text-[0.65rem] leading-none"
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
								class="relative flex min-h-5 p-0.5 transition-opacity {isDimmed(event)
									? linkableTypes.has(event.type) && event.rkey
										? 'opacity-30 hover:opacity-80'
										: 'opacity-30'
									: ''}"
								style="grid-row: {event.startRow} / span {event.spanRows}; grid-column: {event.colStart} / span {event.colSpan}; z-index: {event.zIndex}"
							>
								<ScheduleEventCell
									{event}
									{tz}
									{eventActor}
									{adapter}
									{viewer}
									{rsvpStatuses}
									{rsvpRkeys}
									vodPlaylistUrl={eventVods[event.uri]?.playlistUrl}
									vodSubtitlesUrl={eventVods[event.uri]?.subtitlesUrl}
									{onrsvpchange}
								/>
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
