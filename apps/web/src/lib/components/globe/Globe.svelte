<script lang="ts" module>
	import globeData from './data/globe.bin?url';
	import { decodeLayers, type GlobeLayers } from './layers';

	let loading: Promise<GlobeLayers> | undefined;

	/** Pen geometry is a lazily fetched static asset, shared by every globe on the page. */
	function loadLayers() {
		loading ??= fetch(globeData)
			.then((response) => {
				if (!response.ok) throw new Error(`Globe data: ${response.status}`);
				return response.arrayBuffer();
			})
			.then((buffer) => decodeLayers(new Uint8Array(buffer)))
			.catch((error) => {
				loading = undefined;
				throw error;
			});
		return loading;
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { visibleMarkers } from './events';
	import { Icon, IconButton } from '@atmo-dev/kit';
	import { ArrowUpRight, X } from '@sketchyicons/svelte';
	import {
		CENTER,
		penCircle,
		pointDepth,
		projectPoint,
		shortestRotation,
		RADIUS,
		SIZE
	} from './geometry';
	import { drawGlobe } from './draw';
	import type { GlobeMarker, MarkerMode } from './types';
	import { rimPressure } from './pen';
	import { createFrameGate } from './timing';

	interface Props {
		markers?: GlobeMarker[];
		mode?: MarkerMode;
		daysAhead?: number;
		/** Override the clock for a preview or deterministic server rendering. */
		now?: number;
		initialLongitude?: number;
		/** Degrees per second. A full revolution takes 90 seconds by default. */
		speed?: number;
		fps?: number;
		/** Automatic spin rate limit; defaults to a steady 30 fps at every size. */
		autoFps?: number;
		paused?: boolean;
		showGrid?: boolean;
		showFill?: boolean;
		draggable?: boolean;
		interactive?: boolean;
		selectedMarkerId?: string | null;
		onselect?: (marker: GlobeMarker | null) => void;
		popup?: Snippet<[GlobeMarker]>;
	}

	let {
		markers = [],
		mode = 'upcoming',
		daysAhead = 30,
		now,
		initialLongitude = -25,
		speed = 4,
		fps = 60,
		autoFps = 30,
		paused = false,
		showGrid = true,
		showFill = true,
		draggable = true,
		interactive = true,
		selectedMarkerId = $bindable(null),
		onselect,
		popup
	}: Props = $props();

	const uid = $props.id();
	const rim = penCircle();
	const secondRim = penCircle(260.6, 1.8);
	const thirdRim = penCircle(257.5, 0.7);
	const rimInk = rimPressure(RADIUS, CENTER);
	let element: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(0);
	let layers = $state.raw<GlobeLayers>();
	let theme = $state(0);
	let longitude = $state(untrack(() => initialLongitude));
	let clock = $state(Date.now());
	let mounted = $state(false);
	let inViewport = $state(false);
	let pageVisible = $state(true);
	let reducedMotion = $state(true);
	let hovering = $state(false);
	let keyboardFocus = $state(false);
	let focusTarget = $state<number | null>(null);
	let turning = $state(false);
	let pointerActive = $state(false);
	let dragging = $state(false);
	let coolingDown = $state(false);
	let pointerId: number | null = null;
	let startX = 0;
	let startLongitude = 0;
	let pendingLongitude = 0;
	let dragRaf = 0;
	let dragGate = (_timestamp: number) => true;
	let resumeTimer: ReturnType<typeof setTimeout> | undefined;
	let ignoreClicksUntil = 0;
	const rotationFps = $derived(Math.max(1, Math.min(60, fps, autoFps)));

	const candidates = $derived(visibleMarkers(markers, mode, now ?? clock, daysAhead));
	const selected = $derived(candidates.find((marker) => marker.id === selectedMarkerId));
	const points = $derived(
		candidates
			.map((marker) => {
				const [x, y] = projectPoint(marker.lon, marker.lat, longitude);
				const depth = pointDepth(marker.lon, marker.lat, longitude);
				return { marker, x, y, depth, opacity: Math.min(1, Math.max(0, depth / 0.16)) };
			})
			.filter((point) => point.depth > 0.015)
	);

	const selectedPoint = $derived(points.find((point) => point.marker.id === selectedMarkerId));
	const popupX = $derived(Math.max(24, Math.min(76, ((selectedPoint?.x ?? CENTER) / SIZE) * 100)));
	const popupY = $derived(((selectedPoint?.y ?? CENTER) / SIZE) * 100);

	function select(marker: GlobeMarker | null) {
		if (!interactive) return;
		selectedMarkerId = marker?.id ?? null;
		onselect?.(marker);
	}

	function beginDrag(event: PointerEvent) {
		if (
			!draggable ||
			!event.isPrimary ||
			event.button !== 0 ||
			(event.target as Element).closest('.popup')
		)
			return;
		pointerId = event.pointerId;
		pointerActive = true;
		startX = event.clientX;
		startLongitude = longitude;
		pendingLongitude = longitude;
		dragGate = createFrameGate(fps, performance.now());
		focusTarget = null;
		clearTimeout(resumeTimer);
		coolingDown = false;
	}

	function moveDrag(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const dx = event.clientX - startX;
		if (!dragging && Math.abs(dx) < 6) return;
		if (!dragging) {
			dragging = true;
			selectedMarkerId = null;
			onselect?.(null);
			element.setPointerCapture(event.pointerId);
			if (document.activeElement instanceof SVGElement) document.activeElement.blur();
		}
		pendingLongitude = startLongitude - dx * (180 / element.clientWidth);
		if (!dragRaf) dragRaf = requestAnimationFrame(drawDrag);
	}

	function drawDrag(timestamp: number) {
		if (!dragGate(timestamp)) {
			dragRaf = requestAnimationFrame(drawDrag);
			return;
		}
		longitude = pendingLongitude;
		dragRaf = 0;
	}

	function endDrag(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		pointerId = null;
		cancelAnimationFrame(dragRaf);
		dragRaf = 0;
		if (dragging) {
			longitude = pendingLongitude;
			ignoreClicksUntil = performance.now() + 200;
			coolingDown = true;
			resumeTimer = setTimeout(() => {
				coolingDown = false;
			}, 1800);
		}
		dragging = false;
		pointerActive = false;
		if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
	}

	function closePopup() {
		const id = selectedMarkerId;
		select(null);
		if (id)
			element
				.querySelector<SVGGElement>(`[data-marker="${CSS.escape(id)}"]`)
				?.focus({ preventScroll: true });
	}

	$effect(() => {
		if (inViewport && !layers) loadLayers().then((loaded) => (layers = loaded), console.error);
	});

	$effect(() => {
		if (!layers || !width) return;
		void theme;
		const pixels = Math.round(width * Math.min(devicePixelRatio, 2));
		if (canvas.width !== pixels) canvas.width = canvas.height = pixels;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		// Resolved theme colors; the canvas' outline itself is never drawn.
		const style = getComputedStyle(canvas);
		drawGlobe(
			ctx,
			layers,
			longitude,
			{ ink: style.color, fill: style.outlineColor },
			{ showFill, showGrid }
		);
	});

	// A list outside the globe can also select a city via bind:selectedMarkerId.
	$effect(() => {
		const marker = candidates.find((candidate) => candidate.id === selectedMarkerId);
		const current = untrack(() => longitude);
		focusTarget = marker ? current + shortestRotation(current, marker.lon - 8) : null;
	});

	$effect(() => {
		const target = focusTarget;
		if (target === null) return;
		const start = untrack(() => longitude);
		const distance = target - start;
		if (Math.abs(distance) < 0.001) return;
		if (reducedMotion || !mounted || !pageVisible || !inViewport) {
			longitude = target;
			return;
		}

		turning = true;
		const duration = Math.min(1400, 700 + Math.abs(distance) * 3);
		const started = performance.now();
		const due = createFrameGate(fps, started);
		let raf = 0;
		function tick(timestamp: number) {
			const t = Math.min(1, (timestamp - started) / duration);
			if (due(timestamp) || t === 1) {
				const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
				longitude = start + distance * ease;
			}
			if (t < 1) raf = requestAnimationFrame(tick);
			else turning = false;
		}
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			turning = false;
		};
	});

	$effect(() => {
		if (
			!mounted ||
			!inViewport ||
			!pageVisible ||
			reducedMotion ||
			paused ||
			selected ||
			hovering ||
			keyboardFocus ||
			pointerActive ||
			coolingDown ||
			speed === 0
		)
			return;
		let raf = 0;
		let previous = performance.now();
		const due = createFrameGate(rotationFps, previous);
		function tick(timestamp: number) {
			if (due(timestamp)) {
				const delta = Math.min(timestamp - previous, 150);
				previous = timestamp;
				longitude = ((((longitude + (delta / 1000) * speed + 180) % 360) + 360) % 360) - 180;
			}
			raf = requestAnimationFrame(tick);
		}
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
		};
	});

	onMount(() => {
		mounted = true;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motion.matches;
		};
		const updateVisibility = () => {
			pageVisible = !document.hidden;
		};
		updateMotion();
		updateVisibility();
		motion.addEventListener('change', updateMotion);
		document.addEventListener('visibilitychange', updateVisibility);
		const observer = new IntersectionObserver(
			([entry]) => {
				inViewport = entry.isIntersecting;
			},
			{ rootMargin: '200px' }
		);
		observer.observe(element);
		// Canvas colors don't follow CSS on their own, so redraw on theme changes.
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		const updateTheme = () => theme++;
		scheme.addEventListener('change', updateTheme);
		const themeObserver = new MutationObserver(updateTheme);
		themeObserver.observe(document.documentElement, { attributeFilter: ['class', 'style'] });
		const minute = setInterval(() => {
			clock = Date.now();
		}, 60_000);
		return () => {
			observer.disconnect();
			themeObserver.disconnect();
			scheme.removeEventListener('change', updateTheme);
			motion.removeEventListener('change', updateMotion);
			document.removeEventListener('visibilitychange', updateVisibility);
			clearInterval(minute);
			clearTimeout(resumeTimer);
			cancelAnimationFrame(dragRaf);
		};
	});

	function handleOutside(event: PointerEvent) {
		if (selectedMarkerId && element && !element.contains(event.target as Node)) select(null);
	}
</script>

<svelte:window
	onpointerdown={handleOutside}
	onkeydown={(event) => {
		if (event.key === 'Escape' && selected) {
			closePopup();
		}
	}}
/>

<!-- Without selectable markers the globe is decorative. -->
<div
	class="globe"
	role={interactive ? 'group' : 'presentation'}
	aria-label={interactive ? 'Globe and event locations' : undefined}
	aria-hidden={interactive ? undefined : 'true'}
	aria-busy={interactive ? turning : undefined}
	class:interactive
	class:draggable
	class:dragging
	bind:this={element}
	bind:clientWidth={width}
	onpointerdown={beginDrag}
	onpointermove={moveDrag}
	onpointerup={endDrag}
	onpointercancel={endDrag}
	onlostpointercapture={(event) => {
		// Touch starts with implicit capture on the child SVG. Transferring that
		// capture to this wrapper must not end the drag when the child releases it.
		if (event.target === element) endDrag(event);
	}}
	onclickcapture={(event) => {
		if (performance.now() < ignoreClicksUntil) {
			event.preventDefault();
			event.stopPropagation();
		}
	}}
	onpointerenter={(event) => {
		if (event.pointerType === 'mouse') hovering = true;
	}}
	onpointerleave={() => {
		hovering = false;
	}}
	onfocusin={() => {
		keyboardFocus = true;
	}}
	onfocusout={(event) => {
		if (!element.contains(event.relatedTarget as Node)) keyboardFocus = false;
	}}
>
	<canvas class="ink" class:ready={layers} bind:this={canvas}></canvas>
	<svg
		class="earth"
		viewBox="0 0 640 640"
		fill="none"
		role="group"
		aria-labelledby={interactive ? `${uid}-title ${uid}-desc` : undefined}
	>
		{#if interactive}
			<title id={`${uid}-title`}>A hand-drawn globe</title>
			<desc id={`${uid}-desc`}
				>Rotating Earth. {draggable
					? 'Swipe horizontally or drag to turn the globe. Vertical swipes scroll the page.'
					: ''}
				Choose a city marker to see local events. The event list also provides access to locations on
				the far side.</desc
			>
		{/if}
		<g aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
			<path d={secondRim} class="rim-echo" />
			<path d={thirdRim} class="rim-retrace" />
			<path d={rim} class="rim" />
			<path d={rimInk} class="rim-pressure" />
		</g>
		{#each points as point (point.marker.id)}
			<g
				class="marker"
				class:chosen={selectedMarkerId === point.marker.id}
				transform={`translate(${point.x.toFixed(2)},${point.y.toFixed(2)})`}
				opacity={point.opacity}
				data-marker={point.marker.id}
				role="button"
				aria-disabled={!interactive}
				tabindex={interactive && point.opacity > 0.5 ? 0 : -1}
				aria-label={`${point.marker.label}, ${point.marker.events?.length ?? 0} upcoming events`}
				aria-expanded={interactive ? selectedMarkerId === point.marker.id : undefined}
				onclick={() => select(selectedMarkerId === point.marker.id ? null : point.marker)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						select(selectedMarkerId === point.marker.id ? null : point.marker);
					}
				}}
			>
				<circle cy="-12" r="24" fill="transparent" class="hit-target" />
				<g class="pin" class:event-pin={mode === 'upcoming'}>
					<path
						class="pin-outline"
						d="M.3 1.1C-1.9-2.7-11.8-11.6-11.1-18.6-10.5-25.3-5.6-29.2.5-28.7 7-28.2 11.8-23.4 10.9-17.1 10.1-10.7 3.2-2.7.3 1.1Z"
					/>
					<path
						class="pin-echo"
						d="M-.5.5C-3.5-4.3-12.3-12.7-11.7-19.2-11-25.6-5.6-29.9.8-29.2 7.4-28.5 12.3-23.2 11.3-16.7 10.6-11.3 4-2.5.6.8"
					/>
					<path
						class="pin-center"
						d="M4.3-18.3c.1 2.6-1.9 4.7-4.5 4.4-2.4-.1-4.1-2-4-4.5.1-2.6 2.2-4.2 4.6-4.1 2.3.1 4.1 1.9 3.9 4.2Z"
					/>
					<path class="pin-pressure" d="M-10.9-20.1c.8-4.8 4.5-8 9.2-8.6M7.8-10.1 1.1.1" />
					<path class="pin-scratches" d="m-5.7-12.1 3.9 5.9m-2.3-9.1 5.7 8.2m.1-5.8 2.2 3.1" />
				</g>
			</g>
		{/each}
	</svg>

	{#if selected && selectedPoint && interactive}
		<section
			class="popup"
			class:below={popupY < 34}
			style:left={`clamp(min(134px, 40%), ${popupX}%, max(60%, calc(100% - 134px)))`}
			style:top={`${popupY}%`}
			aria-label={`Events in ${selected.label}`}
		>
			<div class="popup-heading">
				<h3>{selected.label}</h3>
				<IconButton
					label="Close location details"
					onclick={closePopup}
					class="-mt-2 -mr-2 shrink-0"
				>
					<Icon img={X} size={18} />
				</IconButton>
			</div>
			{#if popup}
				{@render popup(selected)}
			{:else}
				<div class="popup-events">
					{#each selected.events ?? [] as event (event.id)}
						<div class="popup-event">
							<time class="popup-date" datetime={event.startsAt}
								>{new Date(event.startsAt).toLocaleString('en-US', {
									weekday: 'short',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: '2-digit'
								})}</time
							>
							{#if event.href}<a href={event.href}
									><span>{event.title}</span><Icon
										img={ArrowUpRight}
										size={16}
										class="mt-0.5 shrink-0"
									/></a
								>
							{:else}<span>{event.title}</span>{/if}
						</div>
					{:else}
						<p class="no-events">Nothing planned yet. Check back soon.</p>
					{/each}
				</div>
				{#if selected.href}<a class="city-link" href={selected.href}
						>All events in {selected.label} <Icon img={ArrowUpRight} size={16} /></a
					>{/if}
			{/if}
		</section>
	{/if}
</div>

<style>
	.globe {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		isolation: isolate;
		--default-paper: #faf9f6;
		--default-ink: #303033;
		--default-accent: #b65334;
		--default-muted: #71717a;
		--default-line: #deddd9;
		--default-shadow: #27272a0c;
		--globe-paper: var(--paper, var(--default-paper));
		--globe-ink: var(--ink, var(--default-ink));
		--globe-accent: var(--accent, var(--default-accent));
		--globe-muted: var(--muted, var(--default-muted));
		--globe-line: var(--line, var(--default-line));
		--globe-shadow: var(--popup-shadow, var(--default-shadow));
	}
	.draggable {
		touch-action: pan-y pinch-zoom;
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
	}
	.dragging,
	.dragging .marker {
		cursor: grabbing;
	}
	.earth {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.ink {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		color: var(--globe-ink);
		outline-color: light-dark(
			color-mix(in srgb, var(--globe-ink) 38%, transparent),
			color-mix(in srgb, var(--globe-ink) 58%, transparent)
		);
		opacity: 0;
		transition: opacity 0.4s ease-out;
	}
	.ink.ready {
		opacity: 1;
	}
	.rim {
		stroke: var(--globe-ink);
		stroke-width: 1.65;
		opacity: 0.96;
	}
	.rim-pressure {
		fill: var(--globe-ink);
		opacity: 0.85;
	}
	.rim-echo {
		stroke: var(--globe-ink);
		stroke-width: 0.95;
		opacity: 0.6;
	}
	.rim-retrace {
		stroke: var(--globe-ink);
		stroke-width: 0.85;
		opacity: 0.6;
		stroke-dasharray: 110 70 230 100 55 280;
	}
	.marker {
		outline: none;
	}
	.interactive .marker {
		cursor: pointer;
	}
	.pin {
		transform-box: fill-box;
		transform-origin: center bottom;
		animation: arrive 0.6s ease-out both;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.pin-outline {
		fill: var(--globe-ink);
		fill-opacity: 0.94;
		stroke: var(--globe-ink);
		stroke-width: 1.65;
	}
	.pin-echo {
		fill: none;
		stroke: var(--globe-ink);
		stroke-width: 0.8;
		opacity: 0.8;
	}
	.pin-center {
		fill: var(--globe-paper);
		stroke: var(--globe-paper);
		stroke-width: 1;
	}
	.event-pin .pin-center {
		stroke-width: 1.3;
	}
	.pin-pressure {
		fill: none;
		stroke: var(--globe-ink);
		stroke-width: 2.5;
		opacity: 0.95;
	}
	.pin-scratches {
		fill: none;
		stroke: var(--globe-paper);
		stroke-width: 0.65;
		opacity: 0.72;
	}
	.marker:hover .pin-outline,
	.marker:focus-visible .pin-outline,
	.marker.chosen .pin-outline {
		stroke-width: 2.2;
	}
	.marker.chosen .pin-outline {
		fill: var(--globe-accent);
		stroke: var(--globe-accent);
	}
	.marker.chosen .pin-pressure {
		stroke: var(--globe-accent);
	}
	.marker:focus-visible .hit-target {
		stroke: var(--globe-accent);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}
	.popup {
		box-sizing: border-box;
		cursor: auto;
		user-select: text;
		-webkit-user-select: text;
		position: absolute;
		z-index: 5;
		width: min(252px, 74%);
		transform: translate(-50%, calc(-100% - 20px));
		background: var(--globe-paper);
		color: var(--globe-ink);
		border: 1px solid var(--globe-line);
		border-radius: var(--radius-panel, 16px);
		box-shadow: 0 4px 16px var(--globe-shadow);
		padding: 20px;
		font-family: var(--font-sans, system-ui, sans-serif);
		animation: popup-in 0.18s ease-out;
	}
	.popup.below {
		transform: translate(-50%, 22px);
	}
	.popup-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 12px;
	}
	h3 {
		font-family: inherit;
		font-size: 16px;
		line-height: 1.4;
		font-weight: 600;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.popup-events {
		display: grid;
		gap: 16px;
		max-height: 16rem;
		overflow-y: auto;
	}
	.popup-event {
		display: grid;
		gap: 4px;
		font-size: 14px;
		line-height: 1.5;
	}
	.popup-date {
		font-size: 12px;
		color: var(--globe-muted);
	}
	.popup-event a {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		font-weight: 600;
		text-decoration: none;
	}
	.popup-event a:hover {
		color: var(--globe-accent);
	}
	.popup-event a,
	.city-link {
		color: inherit;
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}
	.no-events {
		font-size: 12px;
		line-height: 1.6;
		color: var(--globe-muted);
		margin: 0;
	}
	.city-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 16px;
		font-size: 11px;
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	@keyframes popup-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-color-scheme: dark) {
		.globe {
			--default-paper: #18181b;
			--default-ink: #e4e4e7;
			--default-accent: #df987c;
			--default-muted: #a1a1aa;
			--default-line: #3f3f46;
			--default-shadow: #00000040;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pin,
		.popup {
			animation: none;
		}
		.ink {
			transition: none;
		}
	}
</style>
