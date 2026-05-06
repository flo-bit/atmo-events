<script lang="ts">
	import { themeBackgrounds, type EventTheme } from './theme.js';

	let {
		theme = $bindable<EventTheme>({ name: 'minimal', accentColor: 'cyan', baseColor: 'mist' })
	}: {
		theme: EventTheme;
	} = $props();

	const bgKeys = Object.keys(themeBackgrounds);

	const accentColors = [
		{ label: 'red', cls: 'bg-red-500' },
		{ label: 'orange', cls: 'bg-orange-500' },
		{ label: 'amber', cls: 'bg-amber-500' },
		{ label: 'yellow', cls: 'bg-yellow-500' },
		{ label: 'lime', cls: 'bg-lime-500' },
		{ label: 'green', cls: 'bg-green-500' },
		{ label: 'emerald', cls: 'bg-emerald-500' },
		{ label: 'teal', cls: 'bg-teal-500' },
		{ label: 'cyan', cls: 'bg-cyan-500' },
		{ label: 'sky', cls: 'bg-sky-500' },
		{ label: 'blue', cls: 'bg-blue-500' },
		{ label: 'indigo', cls: 'bg-indigo-500' },
		{ label: 'violet', cls: 'bg-violet-500' },
		{ label: 'purple', cls: 'bg-purple-500' },
		{ label: 'fuchsia', cls: 'bg-fuchsia-500' },
		{ label: 'pink', cls: 'bg-pink-500' },
		{ label: 'rose', cls: 'bg-rose-500' }
	];

	const baseColors = [
		{ label: 'gray', cls: 'bg-gray-500' },
		{ label: 'stone', cls: 'bg-stone-500' },
		{ label: 'zinc', cls: 'bg-zinc-500' },
		{ label: 'neutral', cls: 'bg-neutral-500' },
		{ label: 'slate', cls: 'bg-slate-500' },
		{ label: 'olive', cls: 'bg-olive-500' },
		{ label: 'mauve', cls: 'bg-mauve-500' },
		{ label: 'mist', cls: 'bg-mist-500' },
		{ label: 'taupe', cls: 'bg-taupe-500' }
	];
</script>

<div class="flex flex-col gap-6">
	<!-- Theme background -->
	<div>
		<p class="text-base-500 dark:text-base-400 mb-2 text-xs font-medium">Background style</p>
		<div class="flex flex-wrap gap-2">
			{#each bgKeys as key}
				<button
					type="button"
					class="relative flex aspect-video w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 transition-colors
						{theme.name === key
						? 'border-accent-500'
						: 'border-base-200 dark:border-base-700 hover:border-accent-400 dark:hover:border-accent-500'}"
					onclick={() => (theme = { ...theme, name: key })}
				>
					<span class="text-base-600 dark:text-base-400 text-xs font-medium">
						{themeBackgrounds[key]}
					</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Accent color -->
	<div>
		<p class="text-base-500 dark:text-base-400 mb-2 text-xs font-medium">Accent color</p>
		<div class="flex flex-wrap gap-2">
			{#each accentColors as color}
				<button
					type="button"
					class="size-7 cursor-pointer rounded-full border-2 transition-all {color.cls}
						{theme.accentColor === color.label
						? 'border-white scale-110 ring-2 ring-base-400'
						: 'border-transparent hover:scale-105'}"
					onclick={() => (theme = { ...theme, accentColor: color.label })}
				></button>
			{/each}
		</div>
	</div>

	<!-- Base color -->
	<div>
		<p class="text-base-500 dark:text-base-400 mb-2 text-xs font-medium">Base color</p>
		<div class="flex flex-wrap gap-2">
			{#each baseColors as color}
				<button
					type="button"
					class="size-7 cursor-pointer rounded-full border-2 transition-all {color.cls}
						{theme.baseColor === color.label
						? 'border-white scale-110 ring-2 ring-base-400'
						: 'border-transparent hover:scale-105'}"
					onclick={() => (theme = { ...theme, baseColor: color.label })}
				></button>
			{/each}
		</div>
	</div>
</div>
