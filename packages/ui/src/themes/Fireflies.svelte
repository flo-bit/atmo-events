<script lang="ts">
	import { BROWSER as browser } from 'esm-env';

	let canvas: HTMLCanvasElement | undefined = $state(undefined);

	$effect(() => {
		if (!canvas || !browser) return;

		const ctx = canvas.getContext('2d')!;
		let animId: number;

		const COUNT = 50;
		const DRIFT_SPEED = 15;
		const PULSE_SPEED = 0.6;

		interface Firefly {
			x: number;
			y: number;
			vx: number;
			vy: number;
			phase: number;
			pulseRate: number;
			size: number;
			hueShift: number;
		}

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

		const flies: Firefly[] = Array.from({ length: COUNT }, () => ({
			x: Math.random() * canvas!.width,
			y: Math.random() * canvas!.height,
			vx: (Math.random() - 0.5) * 2,
			vy: (Math.random() - 0.5) * 2,
			phase: Math.random() * Math.PI * 2,
			pulseRate: PULSE_SPEED * (0.6 + Math.random() * 0.8),
			size: 3 + Math.random() * 5,
			hueShift: (Math.random() - 0.5) * 60 // -30 to +30 degrees
		}));

		const accentColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent-500')
			.trim();

		let lastTime = performance.now();

		function draw(now: number) {
			const dt = Math.min((now - lastTime) / 1000, 0.1);
			lastTime = now;

			const w = canvas!.width;
			const h = canvas!.height;

			ctx.clearRect(0, 0, w, h);

			for (const fly of flies) {
				fly.phase += fly.pulseRate * dt;
				fly.x += fly.vx * DRIFT_SPEED * dt;
				fly.y += fly.vy * DRIFT_SPEED * dt;

				fly.vx += (Math.random() - 0.5) * 2 * dt;
				fly.vy += (Math.random() - 0.5) * 2 * dt;
				const len = Math.sqrt(fly.vx * fly.vx + fly.vy * fly.vy);
				if (len > 1) {
					fly.vx /= len;
					fly.vy /= len;
				}

				if (fly.x < -40) fly.x = w + 40;
				if (fly.x > w + 40) fly.x = -40;
				if (fly.y < -40) fly.y = h + 40;
				if (fly.y > h + 40) fly.y = -40;

				const glow = (Math.sin(fly.phase) + 1) / 2;
				const alpha = 0.05 + glow * 0.5;
				const radius = fly.size * (0.5 + glow * 0.5);
				const glowRadius = radius * 12;
				const h_shift = fly.hueShift;

				// Large soft glow
				const gradient = ctx.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, glowRadius);
				gradient.addColorStop(
					0,
					accentColor
						? `oklch(from ${accentColor} l c calc(h + ${h_shift}) / ${alpha * 0.4})`
						: `rgba(255, 200, 50, ${alpha * 0.4})`
				);
				gradient.addColorStop(
					0.4,
					accentColor
						? `oklch(from ${accentColor} l c calc(h + ${h_shift}) / ${alpha * 0.15})`
						: `rgba(255, 200, 50, ${alpha * 0.15})`
				);
				gradient.addColorStop(
					1,
					accentColor
						? `oklch(from ${accentColor} l c calc(h + ${h_shift}) / 0)`
						: `rgba(255, 200, 50, 0)`
				);
				ctx.fillStyle = gradient;
				ctx.fillRect(fly.x - glowRadius, fly.y - glowRadius, glowRadius * 2, glowRadius * 2);

				// Bright core
				ctx.beginPath();
				ctx.arc(fly.x, fly.y, radius, 0, Math.PI * 2);
				ctx.fillStyle = accentColor
					? `oklch(from ${accentColor} calc(l * 1.4) c calc(h + ${h_shift}) / ${alpha})`
					: `rgba(255, 230, 100, ${alpha})`;
				ctx.fill();
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

<div class="bg-base-50 dark:bg-base-900 pointer-events-none fixed inset-0 -z-10">
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full opacity-50"></canvas>
</div>
