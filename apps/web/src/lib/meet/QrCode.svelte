<script lang="ts">
	import { onMount } from 'svelte';
	import { sketchQr, type SketchQr } from './sketch-qr';
	let { value }: { value: string } = $props();
	let code = $state<SketchQr>();
	let failed = $state(false);
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	$effect(() => {
		if (!mounted) return;
		const text = value;
		let cancelled = false;
		code = undefined;
		failed = false;
		void import('qrcode')
			.then(({ default: qr }) => sketchQr(qr.create(text, { errorCorrectionLevel: 'H' }).modules))
			.then((result) => {
				if (!cancelled) code = result;
			})
			.catch(() => {
				if (!cancelled) failed = true;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if code}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox={`0 0 ${code.size} ${code.size}`}
		width="320"
		height="320"
		role="img"
		aria-label="Your meeting QR code"
		class="text-ink mx-auto aspect-square h-auto w-full max-w-80"
	>
		<rect width={code.size} height={code.size} fill="var(--ui-page)" />
		<g fill="currentColor" stroke="currentColor" stroke-width="0.025" stroke-linejoin="round">
			<path d={code.modules} />
			{#each code.finders as finder, index (index)}<path d={finder} fill-rule="evenodd" />{/each}
		</g>
	</svg>
{:else}
	<p
		class="text-muted flex aspect-square w-full max-w-80 items-center justify-center text-sm"
		role="status"
	>
		{failed ? 'Could not generate QR code. Share the link below instead.' : 'Loading QR code…'}
	</p>
{/if}
