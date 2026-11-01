<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type QrScanner from 'qr-scanner';
	let { onScan }: { onScan: (value: string) => void } = $props();
	let video: HTMLVideoElement;
	let scanner: QrScanner | undefined;
	let error = $state('');
	let starting = $state(true);

	onMount(() => {
		let disposed = false;
		const scanned = new SvelteSet<string>();
		void (async () => {
			try {
				const { default: Scanner } = await import('qr-scanner');
				if (disposed) return;
				scanner = new Scanner(
					video,
					(result) => {
						if (disposed || scanned.has(result.data)) return;
						scanned.add(result.data);
						onScan(result.data);
					},
					{
						preferredCamera: 'environment',
						returnDetailedScanResult: true,
						highlightScanRegion: true
					}
				);
				scanner.setInversionMode('both');
				await scanner.start();
				if (disposed) scanner.destroy();
			} catch {
				if (!disposed)
					error =
						'Camera unavailable. Allow camera access, or use your phone’s camera app to open their QR code.';
			} finally {
				if (!disposed) starting = false;
			}
		})();
		return () => {
			disposed = true;
			scanner?.destroy();
		};
	});
</script>

<div class="grid gap-1">
	<div class="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-950">
		<video
			bind:this={video}
			muted
			playsinline
			aria-label="QR scanner camera preview"
			class="h-full w-full object-cover"
		></video>
	</div>
	{#if error}<p role="alert" class="text-sm">{error}</p>
	{:else}<p class="text-muted text-center text-sm" role="status">
			{starting ? 'Opening camera…' : 'Scan their QR code.'}
		</p>{/if}
</div>
