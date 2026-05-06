<script lang="ts">
	import { Badge } from '@foxui/core';
	import { formatDay, formatFullDate, formatMonth, formatTime, formatWeekday } from './format';

	let { startDate, endDate }: { startDate: Date; endDate: Date | null } = $props();

	let isSameDay = $derived(
		endDate &&
			startDate.getFullYear() === endDate.getFullYear() &&
			startDate.getMonth() === endDate.getMonth() &&
			startDate.getDate() === endDate.getDate()
	);
</script>

<div class="mb-4 flex items-center gap-4">
	<div
		class="border-base-200 dark:border-base-700 bg-base-100 dark:bg-base-950/30 flex size-12 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border"
	>
		<span class="text-base-500 dark:text-base-400 text-[9px] leading-none font-semibold">
			{formatMonth(startDate)}
		</span>
		<span class="text-base-900 dark:text-base-50 text-lg leading-tight font-bold">
			{formatDay(startDate)}
		</span>
	</div>
	<div>
		<p class="text-base-900 dark:text-base-50 font-semibold">
			{formatWeekday(startDate)}, {formatFullDate(startDate)}
			{#if endDate && !isSameDay}
				- {formatWeekday(endDate)}, {formatFullDate(endDate)}
			{/if}
		</p>
		<p class="text-base-500 dark:text-base-400 flex flex-wrap items-center gap-2 text-sm">
			<span>
				{formatTime(startDate)}
				{#if endDate && isSameDay}
					- {formatTime(endDate)}
				{/if}
			</span>
			<Badge size="sm" variant="secondary">local time</Badge>
		</p>
	</div>
</div>
