<script lang="ts">
	import { browser } from '$app/environment';

	let canvas: HTMLCanvasElement | undefined = $state(undefined);

	$effect(() => {
		if (!canvas || !browser) return;

		const ctx = canvas.getContext('2d')!;
		let animId: number;

		const SEGMENTS = 12;
		const ROTATION_SPEED = 0.06;

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

		const accentColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent-500')
			.trim();

		// Animated blobs in normalized 0-1 space
		const BLOB_COUNT = 20;
		interface Blob {
			x: number;
			y: number;
			vx: number;
			vy: number;
			size: number;
			hueShift: number;
			alpha: number;
		}

		const blobs: (Blob & { sharp?: boolean })[] = [
			...Array.from({ length: BLOB_COUNT }, (): Blob => ({
				x: Math.random(),
				y: Math.random() * 0.8,
				vx: (Math.random() - 0.5) * 0.04,
				vy: (Math.random() - 0.5) * 0.04,
				size: 0.04 + Math.random() * 0.1,
				hueShift: (Math.random() - 0.5) * 80,
				alpha: 0.15 + Math.random() * 0.35
			})),
			// Small sharp dots
			...Array.from({ length: 10 }, () => ({
				x: Math.random(),
				y: Math.random() * 0.8,
				vx: (Math.random() - 0.5) * 0.06,
				vy: (Math.random() - 0.5) * 0.06,
				size: 0.005 + Math.random() * 0.012,
				hueShift: (Math.random() - 0.5) * 80,
				alpha: 0.15 + Math.random() * 0.2,
				sharp: true
			}))
		];

		// Offscreen canvas for one triangle slice
		const sliceCanvas = document.createElement('canvas');
		const sliceCtx = sliceCanvas.getContext('2d')!;

		let lastTime = performance.now();
		let globalRotation = 0;

		function renderSlice(r: number, dt: number) {
			const segAngle = Math.PI / SEGMENTS; // half of full segment
			const sliceW = Math.ceil(r);
			const sliceH = Math.ceil(Math.sin(segAngle) * r);

			sliceCanvas.width = sliceW;
			sliceCanvas.height = sliceH;
			sliceCtx.clearRect(0, 0, sliceW, sliceH);

			// Clip to the triangle
			sliceCtx.save();
			sliceCtx.beginPath();
			sliceCtx.moveTo(0, 0);
			sliceCtx.lineTo(sliceW, 0);
			sliceCtx.lineTo(Math.cos(segAngle) * r, Math.sin(segAngle) * r);
			sliceCtx.closePath();
			sliceCtx.clip();

			for (const b of blobs) {
				b.x += b.vx * dt;
				b.y += b.vy * dt;
				if (b.x < 0 || b.x > 1) b.vx *= -1;
				if (b.y < 0 || b.y > 1) b.vy *= -1;
				b.x = Math.max(0, Math.min(1, b.x));
				b.y = Math.max(0, Math.min(1, b.y));

				const px = b.x * sliceW;
				const py = b.y * sliceH;
				const br = b.size * sliceW;

				if (b.sharp) {
					sliceCtx.fillStyle = accentColor
						? `oklch(from ${accentColor} calc(l * 1.4) c calc(h + ${b.hueShift}) / ${b.alpha})`
						: `rgba(230, 210, 255, ${b.alpha})`;
					sliceCtx.beginPath();
					sliceCtx.arc(px, py, br, 0, Math.PI * 2);
					sliceCtx.fill();
				} else {
					const g = sliceCtx.createRadialGradient(px, py, 0, px, py, br);
					g.addColorStop(0, accentColor
						? `oklch(from ${accentColor} calc(l * 1.2) c calc(h + ${b.hueShift}) / ${b.alpha})`
						: `rgba(200, 150, 255, ${b.alpha})`);
					g.addColorStop(0.5, accentColor
						? `oklch(from ${accentColor} l c calc(h + ${b.hueShift}) / ${b.alpha * 0.3})`
						: `rgba(200, 150, 255, ${b.alpha * 0.3})`);
					g.addColorStop(1, 'transparent');
					sliceCtx.fillStyle = g;
					sliceCtx.fillRect(px - br, py - br, br * 2, br * 2);
				}
			}

			sliceCtx.restore();
			return { sliceW, sliceH };
		}

		function draw(now: number) {
			const dt = Math.min((now - lastTime) / 1000, 0.1);
			lastTime = now;

			const w = canvas!.width;
			const h = canvas!.height;
			const cx = w / 2;
			const cy = h / 2;
			const maxR = Math.hypot(cx, cy);

			globalRotation += ROTATION_SPEED * dt;

			renderSlice(maxR, dt);

			ctx.clearRect(0, 0, w, h);
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(globalRotation);

			const segAngle = (Math.PI * 2) / SEGMENTS;

			for (let i = 0; i < SEGMENTS; i++) {
				ctx.save();
				ctx.rotate(segAngle * i);

				// Normal slice
				ctx.drawImage(sliceCanvas, 0, 0);

				// Mirrored slice (flip along x-axis to fill the other half)
				ctx.scale(1, -1);
				ctx.drawImage(sliceCanvas, 0, 0);

				ctx.restore();
			}

			ctx.restore();
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
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full opacity-50"></canvas>
</div>
