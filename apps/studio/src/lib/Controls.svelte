<script lang="ts">
	import type { createRecorder } from './recorder.svelte.js';

	let {
		playing,
		onplay,
		recorder,
		onrecord
	}: {
		playing: boolean;
		onplay: () => void;
		recorder: ReturnType<typeof createRecorder>;
		onrecord: () => Promise<void>;
	} = $props();
</script>

{#if recorder.state !== 'recording'}
	<div class="controls">
		<button onclick={onplay} disabled={playing}>{playing ? 'Playing…' : 'Play'}</button>
		<button onclick={onrecord} disabled={playing}>Record</button>
		{#if recorder.downloadUrl}
			<a href={recorder.downloadUrl} download="atmo-demo.webm">Download</a>
		{/if}
	</div>
{:else}
	<div class="controls recording">
		<span class="dot"></span>
		<button onclick={() => recorder.stop()}>Stop</button>
	</div>
{/if}

<style>
	.controls {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 1000;
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 6px 8px;
		background: rgba(255, 255, 255, 0.06);
		backdrop-filter: blur(20px);
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	.controls button,
	.controls a {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		border: none;
		padding: 6px 12px;
		border-radius: 999px;
		font-size: 12px;
		cursor: pointer;
		text-decoration: none;
	}
	.controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.recording {
		background: rgba(220, 38, 38, 0.18);
		border-color: rgba(220, 38, 38, 0.4);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #ef4444;
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
</style>
