<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatSlotInTz, getTimezoneAbbr } from '$lib/scheduling/timezones';
	import { Button } from '@foxui/core';
	import type { CandidateWindow } from '$lib/scheduling/types';

	let {
		candidates,
		participantCount,
		organizerTz,
		isOrganizer,
		title = ''
	}: {
		candidates: CandidateWindow[];
		participantCount: number;
		organizerTz: string;
		isOrganizer: boolean;
		title?: string;
	} = $props();

	let tzAbbr = $derived(getTimezoneAbbr(organizerTz));

	function formatRange(start: string, end: string): string {
		const startFmt = formatSlotInTz(start, organizerTz);
		const endDate = new Date(end);
		const endTime = new Intl.DateTimeFormat('en-US', {
			timeZone: organizerTz,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(endDate);
		return `${startFmt} \u2013 ${endTime}`;
	}

	function pickTime(candidate: CandidateWindow, title: string) {
		const params = new URLSearchParams({
			starts_at: candidate.start,
			ends_at: candidate.end,
			timezone: organizerTz
		});
		if (title) {
			params.set('schedule_title', title);
		}
		goto(`/create?${params.toString()}`);
	}
</script>

<div class="space-y-3">
	<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Best Times</h2>

	{#if candidates.length === 0}
		<p class="text-base-500">No responses yet.</p>
	{:else}
		<p class="text-base-500 dark:text-base-400 text-sm">
			Times shown in {tzAbbr}
		</p>

		{#each candidates as candidate (candidate.start)}
			{@const ratio = candidate.count / participantCount}
			{@const isFull = ratio === 1}

			<div
				class="border-base-200 dark:border-base-800 flex items-center justify-between gap-4 rounded-lg border p-4"
			>
				<div class="min-w-0 flex-1">
					<p class="text-base-900 dark:text-base-50 text-sm font-medium">
						{formatRange(candidate.start, candidate.end)}
					</p>

					<div class="mt-1.5 flex items-center gap-2">
						<span
							class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {isFull
								? 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
								: 'bg-base-100 text-base-600 dark:bg-base-800 dark:text-base-400'}"
						>
							{candidate.count}/{participantCount} available
						</span>

						<div class="bg-base-200 dark:bg-base-700 h-1.5 w-16 overflow-hidden rounded-full">
							<div
								class="h-full rounded-full transition-all {isFull
									? 'bg-accent-500'
									: 'bg-base-400 dark:bg-base-500'}"
								style="width: {ratio * 100}%"
							></div>
						</div>
					</div>
				</div>

				{#if isOrganizer}
					<Button
						variant="secondary"
						onclick={() => pickTime(candidate, title)}
					>
						Pick this time
					</Button>
				{/if}
			</div>
		{/each}
	{/if}
</div>
