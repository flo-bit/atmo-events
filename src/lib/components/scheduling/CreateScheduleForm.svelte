<script lang="ts">
	import { Button } from '@foxui/core';
	import { goto } from '$app/navigation';

	let { actorDid }: { actorDid: string } = $props();

	let title = $state('');
	let timeframe = $state('week');
	let customDateStart = $state('');
	let customDateEnd = $state('');
	let duration = $state('60');
	let customDuration = $state('');
	let submitting = $state(false);
	let error: string | null = $state(null);

	function localDateStr(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function getDateRange(): { start: string; end: string } {
		if (timeframe === 'custom') {
			return { start: customDateStart, end: customDateEnd };
		}
		const now = new Date();
		const start = localDateStr(now);
		const end = new Date(now);
		if (timeframe === 'today') end.setDate(end.getDate());
		else if (timeframe === '3days') end.setDate(end.getDate() + 3);
		else if (timeframe === 'week') end.setDate(end.getDate() + 7);
		else if (timeframe === '2weeks') end.setDate(end.getDate() + 14);
		return { start, end: localDateStr(end) };
	}

	function getDurationMinutes(): number {
		if (duration === 'custom') return parseInt(customDuration) || 60;
		return parseInt(duration);
	}

	let isValid = $derived(
		title.trim() &&
			(timeframe !== 'custom' || (customDateStart && customDateEnd)) &&
			(duration !== 'custom' || (parseInt(customDuration) > 0))
	);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		submitting = true;

		try {
			const range = getDateRange();
			const res = await fetch('/schedule/api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create',
					title,
					date_start: range.start,
					date_end: range.end,
					time_start: '00:00',
					time_end: '23:30',
					organizer_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
					duration_minutes: getDurationMinutes()
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error || `request failed (${res.status})`);
			}

			const data = await res.json();
			await goto(`/schedule/${data.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'something went wrong';
		} finally {
			submitting = false;
		}
	}

	const inputClass =
		'bg-base-100 dark:bg-base-900 border-base-200 dark:border-base-700 text-base-900 dark:text-base-100 w-full rounded-lg border px-3 py-2 focus:outline-none';

	const chipClass = (selected: boolean) =>
		`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
			selected
				? 'border-accent-500 bg-accent-500/10 text-accent-400'
				: 'border-base-200 dark:border-base-700 text-base-500 dark:text-base-400 hover:border-base-400 dark:hover:border-base-500'
		}`;
</script>

<div class="mx-auto max-w-md px-4 py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-2 text-2xl font-bold">Find a Time</h1>
	<p class="text-base-500 dark:text-base-400 mb-8 text-sm">
		Create a link to share. Everyone marks when they're free.
	</p>

	<form onsubmit={handleSubmit}>
		<label
			for="schedule-title"
			class="text-base-500 dark:text-base-400 mb-2 block text-xs font-semibold tracking-wider uppercase"
		>
			What's this about?
		</label>
		<input
			id="schedule-title"
			type="text"
			bind:value={title}
			placeholder="Team sync, dinner plans, etc."
			required
			class="{inputClass} mb-6"
		/>

		<!-- timeframe -->
		<fieldset class="mb-6">
			<legend
				class="text-base-500 dark:text-base-400 mb-3 block text-xs font-semibold tracking-wider uppercase"
			>
				When roughly?
			</legend>
			<div class="grid grid-cols-2 gap-2">
				{#each [
					{ value: 'today', label: 'Today', hint: 'Sometime in the next few hours' },
					{ value: '3days', label: 'Few days', hint: 'Within the next 3 days' },
					{ value: 'week', label: 'This week', hint: 'Within the next 7 days' },
					{ value: '2weeks', label: 'Couple weeks', hint: 'Within the next 14 days' }
				] as opt}
					<button
						type="button"
						class={chipClass(timeframe === opt.value)}
						onclick={() => (timeframe = opt.value)}
						title={opt.hint}
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="{chipClass(timeframe === 'custom')} mt-2 w-full"
				onclick={() => (timeframe = 'custom')}
				title="Pick specific start and end dates"
			>
				Custom range
			</button>
			{#if timeframe === 'custom'}
				<div class="mt-3 flex items-center gap-2">
					<input type="date" bind:value={customDateStart} required class={inputClass} />
					<span class="text-base-500 text-sm">to</span>
					<input
						type="date"
						bind:value={customDateEnd}
						min={customDateStart}
						required
						class={inputClass}
					/>
				</div>
			{/if}
		</fieldset>

		<!-- duration -->
		<fieldset class="mb-8">
			<legend
				class="text-base-500 dark:text-base-400 mb-3 block text-xs font-semibold tracking-wider uppercase"
			>
				How long?
			</legend>
			<div class="grid grid-cols-2 gap-2">
				{#each [
					{ value: '30', label: '30 min' },
					{ value: '60', label: '1 hour' },
					{ value: '120', label: '2 hours' },
					{ value: 'custom', label: 'Custom' }
				] as opt}
					<button
						type="button"
						class={chipClass(duration === opt.value)}
						onclick={() => (duration = opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
			{#if duration === 'custom'}
				<div class="mt-3 flex items-center gap-2">
					<input
						type="number"
						bind:value={customDuration}
						min="15"
						step="15"
						placeholder="minutes"
						required
						class={inputClass}
					/>
					<span class="text-base-500 dark:text-base-400 text-sm whitespace-nowrap">minutes</span>
				</div>
			{/if}
		</fieldset>

		{#if error}
			<p class="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<Button type="submit" class="w-full" disabled={submitting || !isValid}>
			{submitting ? 'Creating...' : 'Create & Get Link'}
		</Button>
	</form>
</div>
