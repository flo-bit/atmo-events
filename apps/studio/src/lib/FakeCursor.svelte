<script lang="ts">
	let {
		x = 50,
		y = 50,
		visible = true,
		clicking = false
	}: { x?: number; y?: number; visible?: boolean; clicking?: boolean } = $props();
</script>

{#if visible}
	<div
		class="cursor"
		class:clicking
		style="left: {x}%; top: {y}%;"
		aria-hidden="true"
	>
		<svg viewBox="0 0 24 24" width="28" height="28">
			<path
				d="M5 3 L5 21 L10 16 L13 22 L16 21 L13 15 L20 15 Z"
				fill="#fff"
				stroke="#000"
				stroke-width="1.4"
				stroke-linejoin="round"
			/>
		</svg>
		<span class="ripple"></span>
	</div>
{/if}

<style>
	.cursor {
		position: absolute;
		z-index: 500;
		pointer-events: none;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
		transform: translate(-2px, -2px);
	}
	.ripple {
		position: absolute;
		left: 0;
		top: 0;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		border: 2px solid rgba(167, 139, 250, 0.9);
		opacity: 0;
		transform: scale(0.6);
		pointer-events: none;
	}
	.cursor.clicking .ripple {
		animation: ripple 450ms cubic-bezier(0.2, 0.9, 0.2, 1);
	}
	@keyframes ripple {
		0% { opacity: 0.8; transform: scale(0.4); }
		100% { opacity: 0; transform: scale(2.2); }
	}
</style>
