<script lang="ts">
	import { browser } from '$app/environment';

	let canvas: HTMLCanvasElement | undefined = $state(undefined);

	$effect(() => {
		if (!canvas || !browser) return;

		const ctx = canvas.getContext('2d')!;
		let animId: number;

		const stars: { x: number; y: number; z: number; pz: number }[] = [];
		const COUNT = 600;
		const SPEED = 300; // pixels per second

		let lastWidth = 0;
		function resize() {
			const w = window.innerWidth;
			if (w === lastWidth) return;
			lastWidth = w;
			canvas!.width = w;
			canvas!.height = window.screen.height;
		}
		resize();
		window.addEventListener('resize', resize);

		for (let i = 0; i < COUNT; i++) {
			stars.push({
				x: (Math.random() - 0.5) * canvas.width,
				y: (Math.random() - 0.5) * canvas.height,
				z: Math.random() * canvas.width,
				pz: 0
			});
		}
		stars.forEach((s) => (s.pz = s.z));

		const accentColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent-500')
			.trim();

		let lastTime = performance.now();

		function draw(now: number) {
			const dt = Math.min((now - lastTime) / 1000, 0.1);
			lastTime = now;

			const w = canvas!.width;
			const h = canvas!.height;
			const cx = w / 2;
			const cy = h / 2;
			const speed = SPEED * dt;

			ctx.clearRect(0, 0, w, h);

			for (const star of stars) {
				star.pz = star.z;
				star.z -= speed;

				if (star.z <= 0) {
					star.x = (Math.random() - 0.5) * w;
					star.y = (Math.random() - 0.5) * h;
					star.z = w;
					star.pz = w;
				}

				const sx = (star.x / star.z) * w + cx;
				const sy = (star.y / star.z) * h + cy;
				const px = (star.x / star.pz) * w + cx;
				const py = (star.y / star.pz) * h + cy;

				const size = Math.max(0, (1 - star.z / w) * 4);
				const alpha = Math.max(0, (1 - star.z / w) * 0.9);

				ctx.beginPath();
				ctx.moveTo(px, py);
				ctx.lineTo(sx, sy);
				ctx.strokeStyle = accentColor
					? `oklch(from ${accentColor} l c h / ${alpha})`
					: `rgba(255,255,255,${alpha})`;
				ctx.lineWidth = size;
				ctx.stroke();
			}

			animId = requestAnimationFrame(draw);
		}

		animId = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(animId);
			window.removeEventListener('resize', resize);
		};
	});
</script>

<div class="pointer-events-none fixed inset-0 -z-10 bg-base-50 dark:bg-base-900">
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full opacity-80"></canvas>
</div>
