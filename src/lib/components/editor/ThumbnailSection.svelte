<script lang="ts">
	import { Button, Modal } from '@foxui/core';
	import Avatar from 'svelte-boring-avatars';
	import ThumbnailPresets from '$lib/components/ThumbnailPresets.svelte';
	import { designs, hashSeed, resolveAccentColor } from '$lib/components/thumbnails/designs';

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
			<img
				src={thumbnailPreview}
				alt="Thumbnail preview"
				class="border-base-200 dark:border-base-800 aspect-square w-full rounded-2xl border object-cover"
			/>
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
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="size-6"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
				/>
			</svg>
			<span class="text-sm font-medium">Change thumbnail</span>
		</button>
		{#if thumbnailPreview || selectedPreset}
			<Button
				variant="ghost"
				size="iconSm"
				onclick={removeThumbnail}
				class="bg-base-900/70 absolute top-2 right-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="size-3.5"
				>
					<path
						d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
					/>
				</svg>
			</Button>
		{/if}
	</div>
</div>

<Modal bind:open={showModal}>
	<p class="text-base-900 dark:text-base-50 text-lg font-semibold">Choose thumbnail</p>
	<div class="mt-4 flex max-h-[70vh] flex-col gap-6 overflow-y-auto">
		<Button variant="secondary" class="w-full" onclick={() => fileInput?.click()}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="size-4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
				/>
			</svg>
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
