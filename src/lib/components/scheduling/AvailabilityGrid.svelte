<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { utcToLocal } from '$lib/scheduling/timezones';

	let {
		allSlots,
		selectedSlots,
		heatmap,
		participantCount,
		organizerTz,
		readonly = false,
		highlightSlots = null,
		onchange
	}: {
		allSlots: string[];
		selectedSlots: string[];
		heatmap: Record<string, number>;
		participantCount: number;
		organizerTz: string;
		readonly?: boolean;
		highlightSlots?: Set<string> | null;
		onchange?: (slots: string[]) => void;
	} = $props();

	const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// group slots by date in the viewer's timezone, extract time rows
	let grid = $derived.by(() => {
		const dateMap = new Map<string, { slot: string; time: string }[]>();
		const timeSet = new Set<string>();

		for (const slot of allSlots) {
			const local = utcToLocal(slot, viewerTz);
			const key = local.date;
			if (!dateMap.has(key)) dateMap.set(key, []);
			dateMap.get(key)!.push({ slot, time: local.time });
			timeSet.add(local.time);
		}

		const dates = [...dateMap.keys()].sort();
		const times = [...timeSet].sort();

		// build a lookup: date+time -> utc slot
		const cellMap = new Map<string, string>();
		for (const [date, entries] of dateMap) {
			for (const entry of entries) {
				cellMap.set(`${date}|${entry.time}`, entry.slot);
			}
		}

		// date headers in viewer tz
		const dateHeaders = dates.map((d) => {
			const sample = dateMap.get(d)![0];
			const local = utcToLocal(sample.slot, viewerTz);
			const monthDay = new Intl.DateTimeFormat('en-US', {
				timeZone: viewerTz,
				month: 'short',
				day: 'numeric'
			}).format(new Date(sample.slot));
			return { date: d, dayOfWeek: local.dayOfWeek, monthDay };
		});

		return { dates, times, cellMap, dateHeaders };
	});

	// selection set for O(1) lookup
	let selectedSet = $derived(new Set(selectedSlots));

	// drag state
	let dragging = $state(false);
	let paintMode: 'select' | 'deselect' = $state('select');
	let pendingChanges = new SvelteSet<string>();

	function getEffectiveSelected(slot: string): boolean {
		if (!dragging) return selectedSet.has(slot);
		if (paintMode === 'select') {
			return selectedSet.has(slot) || pendingChanges.has(slot);
		} else {
			return selectedSet.has(slot) && !pendingChanges.has(slot);
		}
	}

	function onPointerDown(slot: string, e: PointerEvent) {
		if (readonly) return;
		e.preventDefault();
		// don't use setPointerCapture — it prevents pointerenter on other cells
		dragging = true;
		paintMode = selectedSet.has(slot) ? 'deselect' : 'select';
		pendingChanges.clear();
		pendingChanges.add(slot);
	}

	function onPointerMove(slot: string, e: PointerEvent) {
		if (!dragging) return;
		// use pointermove instead of pointerenter for reliable drag painting
		pendingChanges.add(slot);
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;

		let next: string[];
		if (paintMode === 'select') {
			const merged = new Set(selectedSlots);
			for (const s of pendingChanges) merged.add(s);
			next = [...merged];
		} else {
			next = selectedSlots.filter((s) => !pendingChanges.has(s));
		}
		pendingChanges.clear();
		onchange?.(next);
	}

	function heatmapOpacity(slot: string): number {
		if (participantCount <= 0) return 0;
		const count = heatmap[slot] ?? 0;
		if (count <= 0) return 0;
		return Math.max(0.1, count / participantCount);
	}

	function formatTime(time: string): string {
		const [h, m] = time.split(':').map(Number);
		const suffix = h >= 12 ? 'p' : 'a';
		const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
		return `${display}:${String(m).padStart(2, '0')}${suffix}`;
	}

	// "now" indicator: find which date column and time row is current
	let nowInfo = $derived.by(() => {
		const now = new Date();
		const local = utcToLocal(now.toISOString(), viewerTz);
		return { date: local.date, time: local.time };
	});

	function isNowSlot(date: string, time: string): boolean {
		if (date !== nowInfo.date) return false;
		const [th, tm] = time.split(':').map(Number);
		const [nh, nm] = nowInfo.time.split(':').map(Number);
		const slotStart = th * 60 + tm;
		const slotEnd = slotStart + 30;
		const nowMin = nh * 60 + nm;
		return nowMin >= slotStart && nowMin < slotEnd;
	}
</script>

<div
	class="select-none overflow-x-auto"
	onpointerup={onPointerUp}
	onpointerleave={onPointerUp}
	role="grid"
	tabindex="0"
	aria-label="Availability grid"
>
	<div
		class="grid gap-px"
		style="grid-template-columns: 3.5rem repeat({grid.dates.length}, minmax(3rem, 1fr));"
	>
		<!-- header: empty corner + date labels -->
		<div class="h-10"></div>
		{#each grid.dateHeaders as header (header.date)}
			<div
				class="flex h-10 flex-col items-center justify-center text-center text-xs leading-tight"
			>
				<span class="text-base-500 dark:text-base-400 font-medium">{header.dayOfWeek}</span>
				<span class="text-base-700 dark:text-base-300 text-[10px]">{header.monthDay}</span>
			</div>
		{/each}

		<!-- time rows -->
		{#each grid.times as time (time)}
			<!-- time label -->
			<div
				class="text-base-500 dark:text-base-400 flex h-6 items-center justify-end pr-2 text-[10px] font-medium"
			>
				{formatTime(time)}
			</div>

			<!-- cells for each date -->
			{#each grid.dates as date (date)}
				{@const slot = grid.cellMap.get(`${date}|${time}`)}
				{#if slot}
					{@const isSelected = getEffectiveSelected(slot)}
					{@const opacity = heatmapOpacity(slot)}
					{@const nowSlot = isNowSlot(date, time)}
					{@const isHighlighted = highlightSlots ? highlightSlots.has(slot) : null}
					{@const isDimmed = highlightSlots !== null && !isHighlighted}
					<button
						type="button"
						class="relative h-6 min-w-12 border transition-colors
							{readonly ? 'cursor-default' : 'cursor-pointer'}
							{isSelected
							? 'bg-accent-500 dark:bg-accent-600 border-accent-400 dark:border-accent-500'
							: 'bg-base-50 dark:bg-base-800 hover:bg-base-100 dark:hover:bg-base-700 border-base-200 dark:border-base-700'}"
						style={isDimmed ? 'opacity: 0.2;' : isHighlighted ? 'opacity: 1;' : ''}
						disabled={readonly}
						onpointerdown={(e) => onPointerDown(slot, e)}
						onpointermove={(e) => onPointerMove(slot, e)}
						aria-label="{date} {time}"
						aria-selected={isSelected}
						role="gridcell"
					>
						{#if opacity > 0 && !isSelected}
							<div
								class="absolute inset-0 rounded-[1px] bg-green-500 dark:bg-green-400"
								style="opacity: {opacity * 0.6};"
							></div>
						{/if}
						{#if nowSlot}
							<div class="absolute right-0 left-0 h-0.5 bg-red-500" style="top: 50%;"></div>
						{/if}
					</button>
				{:else}
					<div class="h-6 min-w-12"></div>
				{/if}
			{/each}
		{/each}
	</div>

	<p class="text-base-500 dark:text-base-400 mt-2 text-xs">
		Times shown in {viewerTz}
	</p>
</div>
