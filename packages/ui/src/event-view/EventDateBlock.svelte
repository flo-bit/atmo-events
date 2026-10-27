<script lang="ts">
	import { Badge } from '@atmo-dev/kit';
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
		class="rounded-ui bg-recess flex size-12 shrink-0 flex-col items-center justify-center overflow-hidden [box-shadow:var(--ui-recess-shadow)]"
	>
		<span class="text-muted text-[9px] leading-none font-semibold">
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
		<p class="text-muted flex flex-wrap items-center gap-2 text-sm">
			<span>
				{formatTime(startDate)}
				{#if endDate && isSameDay}
					- {formatTime(endDate)}
				{/if}
			</span>
			<Badge variant="outline">local time</Badge>
		</p>
	</div>
</div>
