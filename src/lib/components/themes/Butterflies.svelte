<script lang="ts">
	import { browser } from '$app/environment';

	let canvas: HTMLCanvasElement | undefined = $state(undefined);

	$effect(() => {
		if (!canvas || !browser) return;

		const ctx = canvas.getContext('2d')!;
		let animId: number;

		const COUNT = 22;
		const DRIFT_SPEED = 45; // px/sec forward flight
		const DART_RATE = 0.15; // darts per second per butterfly
		const ROTATION_EASE = 4; // rad/sec — how fast body turns toward heading

		interface Butterfly {
			x: number;
			y: number;
			heading: number; // radians — current direction of travel
			rotation: number; // body orientation, lags heading slightly
			turnRate: number; // radians/sec of random-walk steering
			flapPhase: number;
			flapRate: number; // Hz-ish
			depthPhase: number; // slow "closer/further" scaling
			depthRate: number; // Hz of depth oscillation
			size: number;
			hueShift: number;
			alpha: number;
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

		function spawn(): Butterfly {
			const angle = Math.random() * Math.PI * 2;
			return {
				x: Math.random() * canvas!.width,
				y: Math.random() * canvas!.height,
				heading: angle,
				rotation: angle,
				turnRate: 0.8 + Math.random() * 1.2, // 0.8–2 rad/√s of wander
				flapPhase: Math.random() * Math.PI * 2,
				flapRate: 1.5 + Math.random() * 1.5, // 1.5–3 flaps/sec
				depthPhase: Math.random() * Math.PI * 2,
				depthRate: 0.08 + Math.random() * 0.08, // 1/12s to 1/6s — 6–12s period
				size: 10 + Math.random() * 18,
				hueShift: (Math.random() - 0.5) * 40,
				alpha: 0.35 + Math.random() * 0.4
			};
		}

		const butterflies: Butterfly[] = Array.from({ length: COUNT }, spawn);

		const accentColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent-500')
			.trim();

		// Right wing: top + bottom lobe drawn as a single path so their overlap
		// fills once (no alpha accumulation). Positioned so the inner edge sits
		// at +x ≈ 0.05, keeping the two wings from bleeding into each other at
		// the body axis.
		function drawWing(s: number) {
			ctx.beginPath();
			ctx.ellipse(s * 0.65, -s * 0.3, s * 0.6, s * 0.5, -0.25, 0, Math.PI * 2);
			ctx.ellipse(s * 0.55, s * 0.35, s * 0.5, s * 0.4, 0.2, 0, Math.PI * 2);
			ctx.fill();
		}

		function drawButterfly(b: Butterfly) {
			// Smooth 0→1 flap at the natural flapRate (Hz)
			const flap = (Math.sin(b.flapPhase) + 1) / 2;
			const wingScaleX = 0.45 + 0.55 * flap; // 0.45 (folded) → 1.0 (open)

			// Combined scale: slow "depth" breathing (±25% over ~10s) plus a tiny
			// bump synced to each wing flap so peak-open wings read as closer.
			const depth = 1 + 0.25 * Math.sin(b.depthPhase);
			const flapBump = 1 + 0.08 * flap;
			const scale = depth * flapBump;

			ctx.save();
			ctx.translate(b.x, b.y);
			ctx.scale(scale, scale);
			ctx.rotate(b.rotation + Math.PI / 2); // body points along velocity

			const fill = accentColor
				? `oklch(from ${accentColor} l c calc(h + ${b.hueShift}) / ${b.alpha})`
				: `rgba(80, 140, 240, ${b.alpha})`;
			ctx.fillStyle = fill;

			// Right wing
			ctx.save();
			ctx.scale(wingScaleX, 1);
			drawWing(b.size);
			ctx.restore();

			// Left wing (mirrored)
			ctx.save();
			ctx.scale(-wingScaleX, 1);
			drawWing(b.size);
			ctx.restore();

			// Tiny body — slightly darker tint of the accent
			ctx.fillStyle = accentColor
				? `oklch(from ${accentColor} calc(l * 0.55) c calc(h + ${b.hueShift}) / ${Math.min(1, b.alpha + 0.2)})`
				: `rgba(30, 40, 80, ${Math.min(1, b.alpha + 0.2)})`;
			ctx.beginPath();
			ctx.ellipse(0, 0, b.size * 0.08, b.size * 0.55, 0, 0, Math.PI * 2);
			ctx.fill();

			ctx.restore();
		}

		let lastTime = performance.now();

		function draw(now: number) {
			const dt = Math.min((now - lastTime) / 1000, 0.1);
			lastTime = now;

			const w = canvas!.width;
			const h = canvas!.height;

			ctx.clearRect(0, 0, w, h);

			// Framerate-independent turn-toward-heading easing factor.
			const rotationBlend = 1 - Math.exp(-ROTATION_EASE * dt);
			const sqrtDt = Math.sqrt(dt);

			for (const b of butterflies) {
				b.flapPhase += b.flapRate * 2 * Math.PI * dt;
				b.depthPhase += b.depthRate * 2 * Math.PI * dt;

				// Heading random walk — sqrt(dt) keeps the per-second angular
				// variance constant regardless of framerate (Brownian scaling).
				b.heading += (Math.random() - 0.5) * 2 * b.turnRate * sqrtDt;

				// Occasional sharp dart, as a Poisson process at DART_RATE/sec.
				if (Math.random() < DART_RATE * dt) {
					b.heading += (Math.random() - 0.5) * Math.PI;
				}

				b.x += Math.cos(b.heading) * DRIFT_SPEED * dt;
				b.y += Math.sin(b.heading) * DRIFT_SPEED * dt;

				// Body orientation eases toward heading with constant time constant.
				let delta = b.heading - b.rotation;
				while (delta > Math.PI) delta -= Math.PI * 2;
				while (delta < -Math.PI) delta += Math.PI * 2;
				b.rotation += delta * rotationBlend;

				const margin = b.size * 2;
				if (b.x < -margin) b.x = w + margin;
				if (b.x > w + margin) b.x = -margin;
				if (b.y < -margin) b.y = h + margin;
				if (b.y > h + margin) b.y = -margin;

				drawButterfly(b);
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
	<canvas
		bind:this={canvas}
		class="absolute inset-0 h-full w-full opacity-60 blur-[1.5px]"
	></canvas>
</div>
