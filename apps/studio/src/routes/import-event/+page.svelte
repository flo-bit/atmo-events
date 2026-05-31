<script lang="ts">
	import gsap from 'gsap';
	import { onDestroy } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { EventCard, type FlatEventRecord } from '@atmo-dev/events-ui';
	import BrowserFrame from '$lib/BrowserFrame.svelte';
	import FakeCursor from '$lib/FakeCursor.svelte';
	import Controls from '$lib/Controls.svelte';
	import { createRecorder } from '$lib/recorder.svelte.js';

	type Scene = 'idle' | 'title' | 'browse' | 'modal' | 'loading' | 'result' | 'outro';
	type ModalStep = 'choose' | 'import';

	let scene: Scene = $state('idle');
	let modalStep: ModalStep = $state('choose');
	let typedUrl = $state('');
	let cursor = $state({ x: 95, y: 95, visible: false, clicking: false });
	let highlight = $state({ create: false, importOpt: false, importBtn: false });
	let playing = $state(false);

	const recorder = createRecorder();

	const SAMPLE_URL = 'https://ra.co/events/2147482';

	const sampleEvent: FlatEventRecord = {
		$type: 'community.lexicon.calendar.event',
		createdAt: new Date().toISOString(),
		did: 'did:plc:demoeventimport00',
		rkey: 'demo-imported',
		uri: 'at://did:plc:demoeventimport00/community.lexicon.calendar.event/demo-imported',
		name: 'Boiler Room Berlin: Floating Points (DJ Set)',
		description: 'A long-awaited return.',
		startsAt: '2026-06-21T22:00:00.000Z',
		endsAt: '2026-06-22T06:00:00.000Z',
		timezone: 'Europe/Berlin',
		mode: 'inperson',
		locations: [
			{ $type: 'community.lexicon.location.address', locality: 'Berlin', region: 'Germany' }
		]
	};

	let tl: gsap.core.Timeline | null = null;

	function reset() {
		scene = 'idle';
		modalStep = 'choose';
		typedUrl = '';
		highlight.create = false;
		highlight.importOpt = false;
		highlight.importBtn = false;
		cursor.x = 95;
		cursor.y = 95;
		cursor.visible = false;
		cursor.clicking = false;
	}

	function click() {
		cursor.clicking = true;
		setTimeout(() => (cursor.clicking = false), 450);
	}

	function buildTimeline(): gsap.core.Timeline {
		const t = gsap.timeline({
			onStart: () => (playing = true),
			onComplete: () => {
				playing = false;
				reset();
			}
		});
		const typing = { progress: 0 };

		// Scene 1: title card
		t.call(() => (scene = 'title')).to({}, { duration: 2.2 });

		// Scene 2: frame appears, cursor enters from bottom-right
		t.call(() => {
			scene = 'browse';
			cursor.visible = true;
		})
			.to({}, { duration: 0.7 })
			.to(cursor, { x: 88, y: 14, duration: 0.9, ease: 'power2.inOut' })
			.call(() => (highlight.create = true))
			.to({}, { duration: 0.4 })
			.call(click)
			.to({}, { duration: 0.3 });

		// Scene 3: modal opens — choose step
		t.call(() => {
			scene = 'modal';
			modalStep = 'choose';
			highlight.create = false;
		}).to({}, { duration: 0.9 });

		t.to(cursor, { x: 50, y: 64, duration: 0.8, ease: 'power2.inOut' })
			.call(() => (highlight.importOpt = true))
			.to({}, { duration: 0.5 })
			.call(click)
			.to({}, { duration: 0.2 });

		// Scene 4: import step — type URL, click import
		t.call(() => {
			modalStep = 'import';
			highlight.importOpt = false;
		})
			.to({}, { duration: 0.4 })
			.to(cursor, { x: 50, y: 49, duration: 0.5, ease: 'power2.inOut' })
			.to(typing, {
				progress: SAMPLE_URL.length,
				duration: 1.6,
				ease: 'none',
				onUpdate: () => {
					typedUrl = SAMPLE_URL.slice(0, Math.floor(typing.progress));
				}
			})
			.to({}, { duration: 0.3 })
			.to(cursor, { x: 68, y: 80, duration: 0.7, ease: 'power2.inOut' })
			.call(() => (highlight.importBtn = true))
			.to({}, { duration: 0.25 })
			.call(click)
			.to({}, { duration: 0.1 });

		// Scene 5: loading → result
		t.call(() => (scene = 'loading'))
			.to({}, { duration: 1.5 })
			.call(() => {
				highlight.importBtn = false;
				cursor.visible = false;
				scene = 'result';
			})
			.to({}, { duration: 2.8 });

		// Scene 6: outro
		t.call(() => (scene = 'outro')).to({}, { duration: 2.4 });

		return t;
	}

	function play() {
		if (tl?.isActive()) return;
		reset();
		tl = buildTimeline();
	}

	async function record() {
		try {
			await recorder.start();
		} catch (err) {
			console.error('Recording cancelled or failed:', err);
			return;
		}
		// short lead-in so the user can switch to the studio tab if they picked another
		setTimeout(() => play(), 700);
	}

	onDestroy(() => tl?.kill());
</script>

<svelte:head>
	<title>Import event · studio</title>
</svelte:head>

<div class="stage">
	<Controls {playing} onplay={play} {recorder} onrecord={record} />

	{#if scene === 'title'}
		<div class="title-scene" in:fade={{ duration: 400 }} out:fade={{ duration: 300 }}>
			<h1>
				<span class="line" style="--d:0ms">Import events</span>
				<span class="line accent" style="--d:250ms">from anywhere.</span>
			</h1>
		</div>
	{/if}

	{#if scene === 'browse' || scene === 'modal' || scene === 'loading' || scene === 'result'}
		<div
			class="abs"
			in:scale={{ duration: 700, easing: cubicOut, start: 0.92, opacity: 0 }}
			out:fade={{ duration: 350 }}
		>
			<BrowserFrame>
				<div class="page">
					<header>
						<span class="brand">events</span>
						<button class="create-btn" class:hover={highlight.create}>Create Event</button>
					</header>

					{#if scene === 'result'}
						<div class="result-list" in:fly={{ y: 16, duration: 500, easing: cubicOut }}>
							<div class="badge" in:fly={{ y: -8, duration: 400, delay: 100 }}>
								<span class="check">✓</span> Imported from ra.co
							</div>
							<div class="card-host">
								<EventCard event={sampleEvent} />
							</div>
							<div class="card-host muted">
								<EventCard event={sampleEvent} />
							</div>
						</div>
					{:else}
						<div class="placeholder-list">
							{#each Array(3) as _, i (i)}
								<div class="placeholder-row" style="--i:{i}">
									<div class="ph-thumb"></div>
									<div class="ph-text">
										<div class="ph-line short"></div>
										<div class="ph-line"></div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#if scene === 'modal' || scene === 'loading'}
					<div class="modal-backdrop" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
						<div
							class="modal"
							in:fly={{ y: 14, duration: 380, easing: cubicOut }}
							out:fade={{ duration: 200 }}
						>
							{#if modalStep === 'choose'}
								<h2>Create event</h2>
								<p>Start from scratch or pull details from another platform.</p>
								<div class="opts">
									<button class="opt">
										<div class="t">Create new event</div>
										<div class="d">Fill in the details yourself.</div>
									</button>
									<button class="opt" class:hover={highlight.importOpt}>
										<div class="t">Import event from somewhere else</div>
										<div class="d">
											Paste a Luma, Meetup, Eventbrite, Partiful or Resident Advisor link.
										</div>
									</button>
								</div>
							{:else}
								<h2>Import event</h2>
								<p>We'll try to autofill the title, date, location and description.</p>
								<div class="label">Event URL</div>
								<div class="fake-input">
									<span>{typedUrl}</span>
									<span class="caret"></span>
								</div>
								<div class="checkbox-row">
									<span class="checkbox"></span>
									<span>
										<strong>Also accept RSVPs on atmo</strong>
										<span class="hint">
											If off, we'll just list the event and link out to the original.
										</span>
									</span>
								</div>
								<div class="actions">
									<button class="ghost">Back</button>
									<button class="primary" class:hover={highlight.importBtn}>
										{#if scene === 'loading'}
											<span class="spinner"></span> Importing…
										{:else}
											Import
										{/if}
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</BrowserFrame>
		</div>
	{/if}

	{#if scene === 'outro'}
		<div class="outro" in:fade={{ duration: 500 }}>
			<div class="wordmark">atmo<span class="dot">.</span>rsvp</div>
			<div class="cta">Try it now →</div>
		</div>
	{/if}

	<FakeCursor x={cursor.x} y={cursor.y} visible={cursor.visible} clicking={cursor.clicking} />
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		background: radial-gradient(ellipse at center, #1a1a22 0%, #07070a 70%);
		overflow: hidden;
		color: #fff;
	}
	.abs {
		position: absolute;
		inset: 0;
	}

	/* Title */
	.title-scene {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.title-scene h1 {
		font-size: clamp(2.5rem, 7vw, 5.5rem);
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1.05;
		text-align: center;
		margin: 0;
	}
	.title-scene .line {
		display: block;
		opacity: 0;
		transform: translateY(20px);
		animation: title-rise 700ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards;
		animation-delay: var(--d);
	}
	.title-scene .accent {
		background: linear-gradient(120deg, #a78bfa 0%, #f472b6 70%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	@keyframes title-rise {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Page inside the frame */
	.page {
		padding: 28px 36px;
		height: 100%;
		box-sizing: border-box;
	}
	.page header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 28px;
	}
	.brand {
		font-weight: 600;
		font-size: 15px;
		color: #555;
	}
	.create-btn {
		background: #111;
		color: #fff;
		border: none;
		padding: 9px 18px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition:
			transform 200ms,
			box-shadow 200ms;
	}
	.create-btn.hover {
		transform: scale(1.06);
		box-shadow: 0 0 0 6px rgba(167, 139, 250, 0.25);
	}

	.placeholder-list {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.placeholder-row {
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: 16px;
		opacity: 0;
		transform: translateY(8px);
		animation: fade-up 500ms ease-out forwards;
		animation-delay: calc(var(--i) * 90ms);
	}
	.ph-thumb {
		width: 72px;
		height: 72px;
		background: #ececec;
		border-radius: 14px;
	}
	.ph-text {
		display: flex;
		flex-direction: column;
		gap: 8px;
		justify-content: center;
	}
	.ph-line {
		height: 11px;
		background: #ececec;
		border-radius: 4px;
	}
	.ph-line.short {
		width: 30%;
	}
	.ph-line:not(.short) {
		width: 65%;
	}
	@keyframes fade-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Modal */
	.modal-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}
	.modal {
		background: #fff;
		border-radius: 18px;
		padding: 28px;
		width: min(440px, 100%);
		box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.4);
		color: #111;
	}
	.modal h2 {
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 4px;
	}
	.modal p {
		font-size: 13px;
		color: #666;
		margin: 0 0 18px;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.opt {
		background: #fafafa;
		border: 1px solid #e5e5e5;
		border-radius: 14px;
		padding: 14px 16px;
		text-align: left;
		cursor: pointer;
		transition: all 200ms;
	}
	.opt.hover {
		border-color: #a78bfa;
		background: #f5f3ff;
		box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.18);
	}
	.opt .t {
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 2px;
	}
	.opt .d {
		font-size: 11px;
		color: #777;
	}

	.modal .label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 6px;
	}
	.fake-input {
		border: 1px solid #d4d4d8;
		border-radius: 10px;
		padding: 9px 12px;
		font-size: 13px;
		background: #fff;
		font-family: ui-monospace, SFMono-Regular, monospace;
		min-height: 20px;
		display: flex;
		align-items: center;
		gap: 1px;
		margin-bottom: 14px;
	}
	.caret {
		display: inline-block;
		width: 1.5px;
		height: 14px;
		background: #111;
		animation: blink 1s steps(2, start) infinite;
	}
	@keyframes blink {
		to {
			visibility: hidden;
		}
	}

	.checkbox-row {
		display: flex;
		gap: 10px;
		font-size: 12px;
		color: #444;
		font-weight: 400;
		margin-bottom: 16px;
	}
	.checkbox-row strong {
		display: block;
		font-weight: 500;
		color: #111;
		margin-bottom: 2px;
	}
	.checkbox-row .hint {
		color: #888;
		font-size: 11px;
	}
	.checkbox {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		background: #111;
		flex-shrink: 0;
		margin-top: 2px;
		position: relative;
	}
	.checkbox::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 5px;
		width: 4px;
		height: 8px;
		border: solid #fff;
		border-width: 0 1.5px 1.5px 0;
		transform: rotate(45deg);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.actions button {
		padding: 8px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		border: none;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition:
			transform 200ms,
			box-shadow 200ms;
	}
	.actions .ghost {
		background: transparent;
		color: #555;
	}
	.actions .primary {
		background: #111;
		color: #fff;
	}
	.actions .primary.hover {
		transform: scale(1.04);
		box-shadow: 0 0 0 5px rgba(167, 139, 250, 0.25);
	}
	.spinner {
		width: 11px;
		height: 11px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 999px;
		animation: spin 700ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Result */
	.result-list {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #ecfdf5;
		color: #047857;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: 999px;
		align-self: flex-start;
	}
	.check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 999px;
		background: #047857;
		color: #fff;
		font-size: 10px;
	}
	.card-host {
		padding: 4px 0;
	}
	.card-host.muted {
		opacity: 0.45;
	}

	/* Outro */
	.outro {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
	}
	.wordmark {
		font-size: clamp(3rem, 9vw, 7rem);
		font-weight: 700;
		letter-spacing: -0.05em;
	}
	.wordmark .dot {
		color: #a78bfa;
	}
	.cta {
		font-size: 18px;
		color: #aaa;
		font-weight: 500;
	}
</style>
