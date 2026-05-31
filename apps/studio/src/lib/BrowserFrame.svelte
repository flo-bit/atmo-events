<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		addr = 'atmo.rsvp',
		tilt = true,
		children
	}: { addr?: string; tilt?: boolean; children: Snippet } = $props();
</script>

<div class="frame-wrap" class:tilted={tilt}>
	<div class="frame">
		<div class="chrome">
			<div class="dots"><span></span><span></span><span></span></div>
			<div class="addr">{addr}</div>
		</div>
		<div class="screen">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.frame-wrap {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		perspective: 1800px;
	}
	.frame {
		width: min(86vw, 1100px);
		height: min(70vh, 700px);
		background: #0b0b10;
		border-radius: 18px;
		overflow: hidden;
		box-shadow:
			0 80px 120px -40px rgba(0, 0, 0, 0.7),
			0 0 0 1px rgba(255, 255, 255, 0.06);
		transform-style: preserve-3d;
		transition: transform 800ms cubic-bezier(0.2, 0.9, 0.2, 1);
	}
	.tilted .frame {
		transform: rotateX(2deg) rotateY(-6deg);
	}
	.chrome {
		height: 38px;
		background: #15151b;
		display: flex;
		align-items: center;
		padding: 0 14px;
		gap: 14px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.dots {
		display: flex;
		gap: 6px;
	}
	.dots span {
		width: 11px;
		height: 11px;
		border-radius: 999px;
	}
	.dots span:nth-child(1) { background: #ff5f57; }
	.dots span:nth-child(2) { background: #febc2e; }
	.dots span:nth-child(3) { background: #28c840; }
	.addr {
		font-size: 12px;
		color: #888;
		background: rgba(255, 255, 255, 0.05);
		padding: 4px 14px;
		border-radius: 999px;
		flex: 1;
		max-width: 280px;
		text-align: center;
	}
	.screen {
		position: relative;
		height: calc(100% - 38px);
		background: #fafafa;
		color: #111;
		overflow: hidden;
	}
</style>
