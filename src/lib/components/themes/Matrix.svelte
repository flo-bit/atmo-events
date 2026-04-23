<script lang="ts">
	import { browser } from '$app/environment';

	let canvas: HTMLCanvasElement | undefined = $state(undefined);

	$effect(() => {
		if (!canvas || !browser) return;

		const ctx = canvas.getContext('2d')!;
		let animId: number;

		const fontSize = 14;
		const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

		// Speeds in units per second
		const DROP_SPEED = 8; // rows per second
		const FADE_RATE = 2; // alpha per second for trail fade
		const MUTATE_CHANCE = 0.8; // chance per column per second

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

		let columns = Math.floor(canvas.width / fontSize);
		let rows = Math.ceil(canvas.height / fontSize) + 1;
		let drops = new Array(columns).fill(0).map(() => Math.random() * -100);
		let grid: string[][] = Array.from({ length: columns }, () =>
			Array.from({ length: rows }, () => chars[Math.floor(Math.random() * chars.length)])
		);

		const accentColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--color-accent-500')
			.trim();

		let bgColor = '';
		function readBgColor() {
			const isDark = document.documentElement.classList.contains('dark');
			bgColor = getComputedStyle(document.documentElement)
				.getPropertyValue(isDark ? '--color-base-900' : '--color-base-50')
				.trim();
		}
		readBgColor();

		const themeObserver = new MutationObserver(readBgColor);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		let lastResize = canvas.width;
		let lastTime = performance.now();

		function draw(now: number) {
			const dt = Math.min((now - lastTime) / 1000, 0.1); // delta in seconds, capped
			lastTime = now;

			const w = canvas!.width;
			const h = canvas!.height;

			if (w !== lastResize) {
				lastResize = w;
				columns = Math.floor(w / fontSize);
				rows = Math.ceil(h / fontSize) + 1;
				drops = new Array(columns).fill(0).map(() => Math.random() * -100);
				grid = Array.from({ length: columns }, () =>
					Array.from({ length: rows }, () => chars[Math.floor(Math.random() * chars.length)])
				);
			}

			// Randomly mutate characters — framerate independent
			const mutatePerFrame = MUTATE_CHANCE * dt;
			for (let m = 0; m < columns; m++) {
				if (Math.random() < mutatePerFrame) {
					const row = Math.floor(Math.random() * rows);
					grid[m][row] = chars[Math.floor(Math.random() * chars.length)];
				}
			}

			// Fade trail — framerate independent
			const fadeAlpha = Math.min(1, FADE_RATE * dt);
			ctx.fillStyle = bgColor ? `oklch(from ${bgColor} l c h / ${fadeAlpha})` : `rgba(0, 0, 0, ${fadeAlpha})`;
			ctx.fillRect(0, 0, w, h);

			ctx.font = `${fontSize}px monospace`;

			const dropStep = DROP_SPEED * dt;

			for (let i = 0; i < columns; i++) {
				if (drops[i] * fontSize > h && Math.random() < 0.5 * dt) {
					drops[i] = 0;
				}

				if (drops[i] < 0) {
					drops[i] += dropStep;
					continue;
				}

				const row = Math.floor(drops[i]);
				const y = row * fontSize;
				const gridRow = ((row % rows) + rows) % rows;
				const char = grid[i]?.[gridRow] ?? '0';

				// Bright head
				ctx.fillStyle = accentColor
					? `oklch(from ${accentColor} calc(l * 1.3) c h / 0.9)`
					: `rgba(150, 255, 150, 0.9)`;
				ctx.fillText(char, i * fontSize, y);

				// Dimmer trail chars
				for (let t = 1; t < 3; t++) {
					const trailRow = ((gridRow - t) % rows + rows) % rows;
					const trailY = y - t * fontSize;
					if (trailY < 0) break;
					const trailAlpha = 0.4 - t * 0.12;
					ctx.fillStyle = accentColor
						? `oklch(from ${accentColor} l c h / ${trailAlpha})`
						: `rgba(100, 200, 100, ${trailAlpha})`;
					ctx.fillText(grid[i]?.[trailRow] ?? '0', i * fontSize, trailY);
				}

				drops[i] += dropStep;
			}

			animId = requestAnimationFrame(draw);
		}

		// Fill initial background
		ctx.fillStyle = bgColor ? `oklch(from ${bgColor} l c h)` : '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		animId = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(animId);
			window.removeEventListener('resize', resize);
			themeObserver.disconnect();
		};
	});
</script>

<div class="pointer-events-none fixed inset-0 -z-10 bg-base-50 dark:bg-base-900">
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full opacity-40"></canvas>
</div>
