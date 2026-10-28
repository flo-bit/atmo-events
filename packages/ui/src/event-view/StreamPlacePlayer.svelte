<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from '@atmo-dev/kit';
	import { ExternalLink } from '@sketchyicons/svelte';
	import 'plyr/dist/plyr.css';
	import type PlyrType from 'plyr';
	import { sketchyPlyrIcons } from './plyr-icons.js';

	let {
		handle,
		title
	}: {
		handle: string;
		title: string;
	} = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let overlayEl: HTMLAnchorElement | undefined = $state();
	let error = $state(false);
	let controlsVisible = $state(true);

	let pc: RTCPeerConnection | null = null;
	let plyr: PlyrType | null = null;

	const posterUrl = $derived(
		`https://stream.place/api/playback/${encodeURIComponent(handle)}/stream.jpg`
	);

	onMount(() => {
		init();
		return () => {
			if (pc) {
				pc.close();
				pc = null;
			}
			if (videoEl) {
				videoEl.srcObject = null;
			}
			plyr?.destroy();
		};
	});

	function waitForIceGathering(peer: RTCPeerConnection, timeoutMs = 2000): Promise<void> {
		return new Promise((resolve) => {
			if (peer.iceGatheringState === 'complete') {
				resolve();
				return;
			}

			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				peer.removeEventListener('icegatheringstatechange', onStateChange);
				clearTimeout(timer);
				resolve();
			};

			const onStateChange = () => {
				if (peer.iceGatheringState === 'complete') {
					finish();
				}
			};

			peer.addEventListener('icegatheringstatechange', onStateChange);
			const timer = setTimeout(finish, timeoutMs);
		});
	}

	async function init() {
		if (!videoEl) return;

		try {
			pc = new RTCPeerConnection({
				iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
				bundlePolicy: 'max-bundle'
			});

			pc.addTransceiver('video', { direction: 'recvonly' });
			pc.addTransceiver('audio', { direction: 'recvonly' });

			pc.addEventListener('track', (event) => {
				if (!videoEl) return;
				if (event.streams && event.streams[0]) {
					videoEl.srcObject = event.streams[0];
				} else {
					let stream = videoEl.srcObject as MediaStream | null;
					if (!stream) {
						stream = new MediaStream();
						videoEl.srcObject = stream;
					}
					stream.addTrack(event.track);
				}
			});

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			await waitForIceGathering(pc, 2000);

			const sdp = pc.localDescription?.sdp;
			if (!sdp) {
				error = true;
				pc.close();
				pc = null;
				return;
			}

			const response = await fetch(
				`https://stream.place/api/playback/${encodeURIComponent(handle)}/webrtc?rendition=source`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/sdp' },
					body: sdp
				}
			);

			if (!response.ok) {
				error = true;
				pc.close();
				pc = null;
				return;
			}

			const answerSdp = await response.text();
			await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

			const { default: Plyr } = await import('plyr');

			plyr = new Plyr(videoEl, {
				...sketchyPlyrIcons(),
				controls: ['play', 'mute', 'volume', 'fullscreen'],
				settings: [],
				ratio: '16:9'
			});

			plyr.on('controlshidden', () => {
				controlsVisible = false;
			});
			plyr.on('controlsshown', () => {
				controlsVisible = true;
			});

			// Move the overlay link inside Plyr's container so mousemove over the
			// button bubbles into Plyr's activity tracker — otherwise hovering it
			// hides the controls, which hides the button, which reactivates Plyr
			// (a flicker loop).
			const plyrEl = videoEl.closest('.plyr');
			if (plyrEl && overlayEl) plyrEl.appendChild(overlayEl);
		} catch {
			error = true;
			if (pc) {
				pc.close();
				pc = null;
			}
		}
	}
</script>

{#snippet watchOnStreamPlace(hidden = false)}
	<a
		bind:this={overlayEl}
		href="https://stream.place/{handle}"
		target="_blank"
		rel="noopener noreferrer"
		onclick={() => plyr?.pause()}
		class="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition-opacity duration-200 hover:bg-black/75 {hidden
			? 'pointer-events-none opacity-0'
			: 'opacity-100'}"
	>
		Watch on stream.place
		<Icon img={ExternalLink} size={12} />
	</a>
{/snippet}

{#if error}
	<div
		class="bg-base-100 dark:bg-base-900 border-base-200 dark:border-base-800 relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border"
	>
		<div
			class="absolute inset-0 bg-cover bg-center"
			style="background-image: url({posterUrl});"
		></div>
		<div class="absolute inset-0 bg-black/60"></div>
		{@render watchOnStreamPlace()}
		<p class="text-base-100 relative text-sm">Stream is offline</p>
	</div>
{:else}
	<div
		class="border-base-300 dark:border-base-400/40 relative aspect-video w-full max-w-full overflow-hidden rounded-xl border"
	>
		{@render watchOnStreamPlace(!controlsVisible)}
		<video
			bind:this={videoEl}
			class="h-full w-full"
			aria-label={title}
			poster={posterUrl}
			autoplay
			playsinline
			muted
			crossorigin="anonymous"
		></video>
	</div>
{/if}

<style>
	* {
		--plyr-color-main: var(--color-accent-500);
	}
</style>
