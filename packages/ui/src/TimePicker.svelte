<script lang="ts">
	import { TimeField } from 'bits-ui';
	import { Time } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { Icon, IconButton, Popover } from '@atmo-dev/kit';
	import { Clock } from '@sketchyicons/svelte';

	let {
		value = $bindable(''),
		required = false,
		label = 'Time',
		locale = 'en',
		referenceTime = ''
	}: {
		value: string;
		required?: boolean;
		label?: string;
		locale?: string;
		referenceTime?: string;
	} = $props();
	let isOpen = $state(false);
	let listEl = $state<HTMLDivElement>();
	let internalValue = $state<Time>();
	$effect(() => {
		const [hour, minute] = value.split(':').map(Number);
		untrack(() => {
			if (!value || !Number.isFinite(hour) || !Number.isFinite(minute)) internalValue = undefined;
			else if (internalValue?.hour !== hour || internalValue?.minute !== minute)
				internalValue = new Time(hour, minute);
		});
	});
	function handleValueChange(next: Time | undefined) {
		if (next)
			value = `${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`;
	}
	let slots = $derived(
		Array.from({ length: 48 }, (_, i) => {
			const h = Math.floor(i / 2),
				m = i % 2 === 0 ? 0 : 30;
			return {
				key: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
				label: new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, {
					hour: 'numeric',
					minute: '2-digit'
				})
			};
		})
	);
	function durationLabel(key: string) {
		if (!referenceTime) return '';
		const [rh, rm] = referenceTime.split(':').map(Number),
			[h, m] = key.split(':').map(Number);
		const diff = h * 60 + m - rh * 60 - rm;
		if (diff <= 0) return '';
		const hours = Math.floor(diff / 60),
			minutes = diff % 60;
		return hours ? (minutes ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;
	}
</script>

<div
	class="rounded-ui border-line bg-recess text-ink hover:border-control-hover focus-within:outline-focus flex h-11 items-center gap-1 border px-2 text-sm shadow-(--ui-recess-shadow) focus-within:outline-2 focus-within:outline-offset-2"
>
	<TimeField.Root
		bind:value={internalValue}
		onValueChange={handleValueChange}
		granularity="minute"
		{locale}
		{required}
	>
		<TimeField.Label class="sr-only">{label}</TimeField.Label>
		<TimeField.Input class="whitespace-nowrap">
			{#snippet children({ segments })}{#each segments as segment, i (segment.part + i)}
					{#if segment.part === 'literal'}<span class="text-muted">{segment.value}</span
						>{:else}<TimeField.Segment
							part={segment.part}
							class="hover:bg-recess focus:bg-accent-soft rounded px-0.5 focus:outline-none"
							>{segment.value}</TimeField.Segment
						>{/if}
				{/each}{/snippet}
		</TimeField.Input>
	</TimeField.Root>
	<Popover
		bind:open={isOpen}
		class="max-h-60 overflow-y-auto p-2"
		aria-label={`Choose ${label.toLowerCase()}`}
		onOpenAutoFocus={(event) => {
			const selected = listEl?.querySelector<HTMLButtonElement>('[data-selected]');
			if (selected) {
				event.preventDefault();
				selected.focus();
				selected.scrollIntoView({ block: 'center' });
			}
		}}
	>
		{#snippet trigger({ props })}<IconButton
				{...props}
				label={`Choose ${label.toLowerCase()}`}
				class="size-7"><Icon img={Clock} size={15} /></IconButton
			>{/snippet}
		<div bind:this={listEl}>
			{#each slots as slot (slot.key)}<button
					type="button"
					class="rounded-ui text-ink hover:bg-recess aria-pressed:bg-accent-soft aria-pressed:text-action flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm"
					aria-pressed={value === slot.key}
					data-selected={value === slot.key ? '' : undefined}
					onclick={() => {
						value = slot.key;
						isOpen = false;
					}}
					>{slot.label}{#if durationLabel(slot.key)}<span class="text-muted text-xs"
							>{durationLabel(slot.key)}</span
						>{/if}</button
				>{/each}
		</div>
	</Popover>
</div>
