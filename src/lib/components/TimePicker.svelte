<script lang="ts">
	// @ts-nocheck
	import { Popover } from 'bits-ui';
	import { TimeField } from 'bits-ui';
	import { Time } from '@internationalized/date';
	import { untrack, tick } from 'svelte';

	let {
		value = $bindable(''),
		required = false,
		locale = 'en',
		referenceTime = ''
	}: {
		value: string;
		required?: boolean;
		locale?: string;
		referenceTime?: string;
	} = $props();

	let isOpen = $state(false);
	let listEl: HTMLDivElement | undefined = $state(undefined);
	let internalValue: Time | undefined = $state(undefined);

	function parseTimeStr(str: string): Time | undefined {
		if (!str) return undefined;
		const [hourStr, minuteStr] = str.split(':');
		const hour = parseInt(hourStr, 10);
		const minute = parseInt(minuteStr, 10);
		if (isNaN(hour) || isNaN(minute)) return undefined;
		return new Time(hour, minute);
	}

	function formatTimeStr(t: Time): string {
		const h = String(t.hour).padStart(2, '0');
		const m = String(t.minute).padStart(2, '0');
		return `${h}:${m}`;
	}

	$effect(() => {
		const parsed = parseTimeStr(value);
		untrack(() => {
			if (parsed) {
				if (
					!internalValue ||
					parsed.hour !== internalValue.hour ||
					parsed.minute !== internalValue.minute
				) {
					internalValue = parsed;
				}
			} else {
				internalValue = undefined;
			}
		});
	});

	function handleValueChange(newVal: Time | undefined) {
		if (newVal && newVal instanceof Time) {
			internalValue = newVal;
			value = formatTimeStr(newVal);
		}
	}

	// Generate 48 half-hour slots
	const slots = Array.from({ length: 48 }, (_, i) => {
		const h = Math.floor(i / 2);
		const m = i % 2 === 0 ? 0 : 30;
		const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
		const date = new Date(2000, 0, 1, h, m);
		const label = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
		return { key, label };
	});

	function durationLabel(slotKey: string): string {
		if (!referenceTime) return '';
		const [rh, rm] = referenceTime.split(':').map(Number);
		const [sh, sm] = slotKey.split(':').map(Number);
		let diff = (sh * 60 + sm) - (rh * 60 + rm);
		if (diff <= 0) return '';
		const hours = Math.floor(diff / 60);
		const mins = diff % 60;
		if (hours === 0) return `${mins}m`;
		if (mins === 0) return `${hours}h`;
		return `${hours}h ${mins}m`;
	}

	function selectSlot(key: string) {
		value = key;
		isOpen = false;
	}

	// Scroll to selected/closest slot when popover opens
	$effect(() => {
		if (isOpen && listEl) {
			tick().then(() => {
				if (!listEl) return;
				const selected = listEl.querySelector('[data-selected]');
				if (selected) {
					selected.scrollIntoView({ block: 'center' });
				} else if (value) {
					const [hStr, mStr] = value.split(':');
					const totalMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
					const closestIdx = Math.min(Math.round(totalMin / 30), 47);
					const el = listEl.children[closestIdx];
					if (el) el.scrollIntoView({ block: 'center' });
				}
			});
		}
	});
</script>

<div class="relative">
	<TimeField.Root
		bind:value={internalValue}
		onValueChange={handleValueChange}
		granularity="minute"
		{locale}
		{required}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="border-base-300 bg-base-100 text-base-900 focus-within:border-accent-500 dark:border-base-700 dark:bg-base-800 dark:text-base-100 dark:focus-within:border-accent-400 flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-xl border px-2.5 py-1.5 text-sm transition-colors"
			onfocusin={() => (isOpen = true)}
		>
			<TimeField.Input>
				{#snippet children({ segments })}
					{#each segments as segment, i (segment.part + i)}
						{#if segment.part === 'literal'}
							<span class="text-base-400 dark:text-base-500">{segment.value}</span>
						{:else}
							<TimeField.Segment
								part={segment.part}
								class="hover:bg-base-200 focus:bg-base-200 dark:hover:bg-base-700 dark:focus:bg-base-700 rounded px-0.5 focus:outline-none"
							>
								{segment.value}
							</TimeField.Segment>
						{/if}
					{/each}
				{/snippet}
			</TimeField.Input>

			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="text-base-400 dark:text-base-500 ml-auto size-4 pl-0.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
				/>
			</svg>
		</div>
	</TimeField.Root>

	{#if isOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-40"
			onclick={() => (isOpen = false)}
			onkeydown={(e) => { if (e.key === 'Escape') isOpen = false; }}
		></div>
		<div
			bind:this={listEl}
			class="border-base-200 bg-base-50 dark:border-base-700 dark:bg-base-900 absolute left-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border p-2 shadow-lg"
		>
			{#each slots as slot (slot.key)}
				<button
					type="button"
					class="w-full rounded-lg px-4 py-1.5 text-left text-sm whitespace-nowrap transition-colors
						{value === slot.key
						? 'bg-accent-100 dark:bg-accent-900 font-medium text-accent-900 dark:text-accent-100'
						: 'text-base-700 hover:bg-base-200 dark:text-base-300 dark:hover:bg-base-700'}"
					data-selected={value === slot.key ? '' : undefined}
					onclick={() => selectSlot(slot.key)}
				>
					{slot.label}
					{#if durationLabel(slot.key)}
						<span class="ml-2 opacity-50">{durationLabel(slot.key)}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
