<script lang="ts">
	import { Button, Icon, Input, Popover } from '@atmo-dev/kit';
	import { Globe } from '@sketchyicons/svelte';
	let { value = $bindable('') }: { value: string } = $props();
	let isOpen = $state(false);
	let search = $state('');
	const allTimezones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
	const offsets = new Map<string, string>();
	function getOffset(tz: string) {
		if (offsets.has(tz)) return offsets.get(tz)!;
		try {
			const result =
				new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
					.formatToParts(new Date())
					.find((part) => part.type === 'timeZoneName')?.value ?? '';
			offsets.set(tz, result);
			return result;
		} catch {
			return '';
		}
	}
	function getCityName(tz: string) {
		return (tz.split('/').at(-1) || tz).replace(/_/g, ' ');
	}
	let filtered = $derived(
		allTimezones.filter(
			(tz) =>
				!search.trim() ||
				`${tz} ${getCityName(tz)} ${getOffset(tz)}`.toLowerCase().includes(search.toLowerCase())
		)
	);
</script>

<Popover bind:open={isOpen} class="w-64 p-2" aria-label="Choose timezone">
	{#snippet trigger({ props })}<Button
			{...props}
			variant="secondary"
			class="border-line bg-recess hover:border-control-hover min-h-11 w-full justify-start gap-2.5 px-3 text-xs shadow-(--ui-recess-shadow)"
			aria-label={`Timezone: ${value}`}
		>
			<Icon img={Globe} size={17} class="text-muted" />
			<span class="min-w-0 flex-1 truncate text-left">{getCityName(value)}</span>
			<span class="text-muted shrink-0">{getOffset(value)}</span>
		</Button>{/snippet}
	<Input
		type="search"
		bind:value={search}
		aria-label="Search timezone"
		placeholder="Search timezone…"
		class="mb-2"
	/>
	<div class="max-h-60 overflow-y-auto">
		{#each filtered as tz (tz)}<button
				type="button"
				class="rounded-ui text-ink hover:bg-recess aria-pressed:bg-accent-soft aria-pressed:text-action flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs"
				aria-pressed={value === tz}
				onclick={() => {
					value = tz;
					isOpen = false;
					search = '';
				}}><span>{getCityName(tz)}</span><span class="text-muted">{getOffset(tz)}</span></button
			>{/each}
		{#if !filtered.length}<p class="text-muted p-3 text-xs">No results</p>{/if}
	</div>
</Popover>
