<script lang="ts">
	// @ts-nocheck
	import { designs, resolveAccentColor } from './thumbnails/designs';
	import { tick } from 'svelte';

	let {
		name = '',
		dateStr = '',
		accent = '',
		seed = 1,
		selected = $bindable<string | null>(null),
		onselect
	}: {
		name?: string;
		dateStr?: string;
		accent?: string;
		seed?: number;
		selected?: string | null;
		onselect?: () => void;
	} = $props();

	const presetKeys = Object.keys(designs);
	const previewSize = 200;

	let containerEl: HTMLDivElement | undefined = $state(undefined);

	function renderAll() {
		if (!containerEl) return;
		const color = resolveAccentColor(accent);
		const canvases = containerEl.querySelectorAll<HTMLCanvasElement>('canvas');
		canvases.forEach((canvas) => {
			const key = canvas.dataset.key!;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			canvas.width = previewSize;
			canvas.height = previewSize;
			designs[key](ctx, previewSize, previewSize, name || 'Event', dateStr, seed, color);
		});
	}

	$effect(() => {
		void name;
		void dateStr;
		void accent;
		void seed;
		void containerEl;
		tick().then(renderAll);
	});
</script>

<div class="flex flex-col gap-3">
	<p class="text-base-500 dark:text-base-400 text-xs font-medium">Preset thumbnails</p>
	<div class="grid grid-cols-3 gap-2" bind:this={containerEl}>
		{#each presetKeys as key}
			<button
				type="button"
				class="aspect-square cursor-pointer overflow-hidden rounded-xl border-2 transition-colors
					{selected === key
					? 'border-accent-500'
					: 'border-base-200 dark:border-base-700 hover:border-accent-400 dark:hover:border-accent-500'}"
				onclick={() => { selected = key; onselect?.(); }}
			>
				<canvas data-key={key} class="h-full w-full"></canvas>
			</button>
		{/each}
	</div>
</div>
