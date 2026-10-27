<script lang="ts">
	import { Image, Upload, X } from '@sketchyicons/svelte';
	import { Button, Icon, Modal, InsetImage } from '@atmo-dev/kit';
	import Avatar from 'svelte-boring-avatars';
	import ThumbnailPresets from '../ThumbnailPresets.svelte';
	import { designs, hashSeed, resolveAccentColor } from '../thumbnails/designs.js';

	let {
		rkey,
		name,
		dateStr,
		accent,
		thumbnailFile = $bindable(),
		thumbnailPreview = $bindable(),
		thumbnailChanged = $bindable(),
		selectedPreset = $bindable()
	}: {
		rkey: string;
		name: string;
		dateStr: string;
		accent: string;
		thumbnailFile: File | null;
		thumbnailPreview: string | null;
		thumbnailChanged: boolean;
		selectedPreset: string | null;
	} = $props();

	let fileInput: HTMLInputElement | undefined = $state();
	let presetPreviewCanvas: HTMLCanvasElement | undefined = $state();
	let showModal = $state(false);
	let isDragOver = $state(false);

	const seed = $derived(hashSeed(rkey));

	function setThumbnail(file: File) {
		thumbnailFile = file;
		thumbnailChanged = true;
		selectedPreset = null;
		if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
		thumbnailPreview = URL.createObjectURL(file);
	}

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		setThumbnail(file);
		showModal = false;
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function onDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file?.type.startsWith('image/')) {
			setThumbnail(file);
		}
	}

	function removeThumbnail() {
		thumbnailFile = null;
		thumbnailChanged = true;
		selectedPreset = null;
		if (thumbnailPreview) {
			URL.revokeObjectURL(thumbnailPreview);
			thumbnailPreview = null;
		}
		if (fileInput) fileInput.value = '';
	}

	// Render preset preview canvas whenever the selection, name, date, or accent changes.
	$effect(() => {
		if (selectedPreset && presetPreviewCanvas && designs[selectedPreset]) {
			const ctx = presetPreviewCanvas.getContext('2d');
			if (!ctx) return;
			presetPreviewCanvas.width = 800;
			presetPreviewCanvas.height = 800;
			designs[selectedPreset](
				ctx,
				800,
				800,
				name || 'Event',
				dateStr,
				seed,
				resolveAccentColor(accent)
			);
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="order-1 max-w-sm md:order-0 md:col-start-1 md:max-w-none"
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		onchange={onFileChange}
		class="hidden"
	/>
	<div class="group relative">
		{#if thumbnailPreview}
			<InsetImage src={thumbnailPreview} alt="Thumbnail preview" class="rounded-panel w-full" />
		{:else if selectedPreset && designs[selectedPreset]}
			<div
				class="border-base-200 dark:border-base-800 aspect-square w-full overflow-hidden rounded-2xl border"
			>
				<canvas bind:this={presetPreviewCanvas} class="h-full w-full"></canvas>
			</div>
		{:else}
			<div
				class="bg-base-100 dark:bg-base-900 aspect-square w-full overflow-hidden rounded-2xl [&>svg]:h-full [&>svg]:w-full"
			>
				<Avatar
					size={400}
					name={rkey}
					variant="marble"
					colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
					square
				/>
			</div>
		{/if}
		<button
			type="button"
			onclick={() => (showModal = true)}
			class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl bg-black/0 text-white/0 transition-colors group-hover:bg-black/40 group-hover:text-white/90 {isDragOver
				? 'bg-black/40 text-white/90'
				: ''}"
		>
			<Icon img={Image} size={24} />
			<span class="text-sm font-medium">Change thumbnail</span>
		</button>
		{#if thumbnailPreview || selectedPreset}
			<Button
				variant="ghost"
				size="icon"
				aria-label="Remove thumbnail"
				onclick={removeThumbnail}
				class="bg-base-900/70 absolute top-2 right-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 focus-visible:opacity-100"
			>
				<Icon img={X} size={14} />
			</Button>
		{/if}
	</div>
</div>

<Modal bind:open={showModal} title="Choose thumbnail">
	<div class="mt-4 flex max-h-[70vh] flex-col gap-6 overflow-y-auto">
		<Button variant="secondary" class="w-full" onclick={() => fileInput?.click()}>
			<Icon img={Upload} size={16} />
			Upload own thumbnail
		</Button>
		<ThumbnailPresets
			{name}
			{dateStr}
			{accent}
			{seed}
			bind:selected={selectedPreset}
			onselect={() => {
				showModal = false;
				thumbnailPreview = null;
				thumbnailFile = null;
				thumbnailChanged = true;
			}}
		/>
	</div>
</Modal>
