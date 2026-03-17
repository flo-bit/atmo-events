<script lang="ts">
	import { Portal } from 'bits-ui';

	let {
		processImageFile,
		isDragOver = $bindable()
	}: {
		processImageFile: (file: File) => Promise<void>;
		isDragOver: boolean;
	} = $props();

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		const dt = event.dataTransfer;
		if (!dt) return;

		let imageCount = 0;
		if (dt.items) {
			for (let i = 0; i < dt.items.length; i++) {
				const item = dt.items[i];
				if (item && item.kind === 'file' && item.type.startsWith('image/')) {
					imageCount++;
				}
			}
		} else if (dt.files) {
			for (let i = 0; i < dt.files.length; i++) {
				const file = dt.files[i];
				if (file?.type.startsWith('image/')) {
					imageCount++;
				}
			}
		}

		isDragOver = imageCount > 0;
	}
	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragOver = false;
	}
	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragOver = false;
		if (!event.dataTransfer?.files?.length) return;
		for (const file of event.dataTransfer.files) {
			if (file?.type.startsWith('image/')) {
				await processImageFile(file);
			}
		}
	}
</script>

<svelte:window ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop} />

{#if isDragOver}
	<Portal>
		<div
			class="bg-base-100/80 dark:bg-base-900/80 text-primary dark:text-base-100 pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center text-4xl font-bold backdrop-blur-md"
		>
			Drop file to add it to your message
		</div>
	</Portal>
{/if}
